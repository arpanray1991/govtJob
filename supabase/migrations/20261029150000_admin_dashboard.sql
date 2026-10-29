begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
create function public.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
end;
$$;

alter table public.exams add column archived boolean not null default false;
alter table public.questions add column archived boolean not null default false;
alter table public.questions drop constraint questions_exam_id_position_key;
create unique index questions_current_position_idx
  on public.questions(exam_id, position) where not archived;
alter table public.exams add constraint archived_exam_unpublished check (not archived or not is_published);

alter table public.exam_sessions
  add column duration_minutes integer,
  add column total_marks numeric(8,2),
  add column negative_marking_rate numeric(5,4);
update public.exam_sessions s set duration_minutes = e.duration_minutes,
  total_marks = e.total_marks, negative_marking_rate = e.negative_marking_rate
from public.exams e where e.id = s.exam_id;
alter table public.exam_sessions
  alter column duration_minutes set not null,
  alter column total_marks set not null,
  alter column negative_marking_rate set not null;

create table public.guest_visits (
  day date not null default (now() at time zone 'UTC')::date,
  visitor_id uuid not null,
  page_views integer not null default 1 check (page_views between 1 and 1000),
  primary key (day, visitor_id)
);
alter table public.guest_visits enable row level security;
revoke all on public.guest_visits from anon, authenticated;

create function public.record_guest_visit(p_visitor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then return; end if;
  if p_visitor_id is null then
    raise exception using errcode = '22023', message = 'A daily anonymous browser ID is required.';
  end if;
  insert into public.guest_visits(day, visitor_id)
  values ((now() at time zone 'UTC')::date, p_visitor_id)
  on conflict (day, visitor_id) do update
    set page_views = least(public.guest_visits.page_views + 1, 1000);
end;
$$;

create function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'registered_users', (select count(*) from auth.users),
    'total_attempts', (select count(*) from public.submissions),
    'exam_series', (select count(*) from public.exams where level = 1 and not archived),
    'guest_days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day desc) from (
        select dates.day::date as day, count(g.visitor_id) as browsers,
          coalesce(sum(g.page_views), 0) as page_views
        from generate_series((now() at time zone 'UTC')::date - 29,
          (now() at time zone 'UTC')::date, interval '1 day') dates(day)
        left join public.guest_visits g on g.day = dates.day::date
        group by dates.day
      ) d
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.admin_users_list(p_search text default '', p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_admin();
  if p_page is null or p_page < 0 or p_page > 100000 or p_search is null or length(p_search) > 200 then
    raise exception using errcode = '22023', message = 'Invalid user search or page.';
  end if;
  with users as (
    select u.id, u.email, coalesce(p.full_name, '') as full_name,
      u.created_at as registered_at, u.last_sign_in_at,
      (select count(*) from public.submissions s where s.user_id = u.id) as tests_completed,
      (select coalesce(round(avg(s.score * 100 / s.total_marks), 2), 0)
       from public.submissions s where s.user_id = u.id) as average_score
    from auth.users u left join public.profiles p on p.id = u.id
    where p_search = '' or position(lower(p_search) in lower(coalesce(u.email, '') || ' ' || coalesce(p.full_name, ''))) > 0
  )
  select jsonb_build_object('total', (select count(*) from users),
    'users', coalesce((select jsonb_agg(to_jsonb(u) order by registered_at desc, id)
      from (select * from users order by registered_at desc, id limit 25 offset p_page * 25) u), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

create function public.admin_attempts(p_user_id uuid, p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_admin();
  if p_user_id is null or p_page is null or p_page < 0 or p_page > 100000 then
    raise exception using errcode = '22023', message = 'Choose a user and valid page.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.submissions where user_id = p_user_id),
    'attempts', coalesce((select jsonb_agg(to_jsonb(s) order by s.submitted_at desc, s.id) from (
      select s.id, s.exam_id, e.title as exam_title, e.level, s.score, s.total_marks,
        s.accuracy_percentage, s.time_taken_seconds, s.correct_count, s.incorrect_count,
        s.attempted_count, s.submitted_at
      from public.submissions s join public.exams e on e.id = s.exam_id
      where s.user_id = p_user_id order by s.submitted_at desc, s.id
      limit 25 offset p_page * 25
    ) s), '[]'::jsonb),
    'active_sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'exam_title', e.title, 'level', e.level,
      'started_at', s.started_at, 'expires_at', s.expires_at
    ) order by s.started_at desc) from public.exam_sessions s join public.exams e on e.id = s.exam_id
      where s.user_id = p_user_id and s.status = 'active'), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.admin_result(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_admin();
  select to_jsonb(s) || jsonb_build_object('exam_title', e.title, 'level', e.level,
    'questions', (select jsonb_agg(jsonb_build_object(
      'id', q.id, 'question_text', q.question_text, 'options', q.options,
      'topic', q.topic, 'correct_option_id', q.correct_option_id, 'explanation', q.explanation
    ) order by array_position(es.question_ids, q.id)) from public.questions q where q.id = any(es.question_ids)))
  into v_result from public.submissions s
  join public.exams e on e.id = s.exam_id
  join public.exam_sessions es on es.id = s.session_id
  where s.id = p_submission_id;
  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Submission not found.';
  end if;
  return v_result;
end;
$$;

create function public.admin_content(p_exam_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]'::jsonb) from public.categories c),
    'exams', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'question_count', (select count(*) from public.questions q where q.exam_id = e.id and not q.archived),
      'has_sessions', exists(select 1 from public.exam_sessions s where s.exam_id = e.id)
    ) order by e.title, e.series_id, e.level), '[]'::jsonb) from public.exams e),
    'questions', (select coalesce(jsonb_agg(to_jsonb(q) order by q.position, q.archived, q.id), '[]'::jsonb)
      from public.questions q where q.exam_id = p_exam_id)
  ) into v_result;
  return v_result;
end;
$$;

create function public.admin_save_category(p_id uuid, p_name text, p_slug text, p_icon text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform public.require_admin();
  if p_name is null or length(trim(p_name)) not between 1 and 80 or
    p_slug is null or length(p_slug) > 80 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or
    p_icon is null or p_icon not in ('landmark', 'building', 'train', 'book') then
    raise exception using errcode = '22023', message = 'Provide a category name, lowercase URL slug and valid icon.';
  end if;
  if p_id is not null and not exists(select 1 from public.categories where id = p_id) then
    raise exception using errcode = 'P0002', message = 'Category not found.';
  end if;
  insert into public.categories(id, name, slug, icon) values(v_id, trim(p_name), p_slug, p_icon)
  on conflict(id) do update set name = excluded.name, slug = excluded.slug, icon = excluded.icon;
  return v_id;
end;
$$;

create function public.admin_save_exam(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.exams%rowtype;
  v_root public.exams%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_series uuid;
  v_level integer;
  v_duration integer;
  v_marks numeric;
  v_negative numeric;
  v_published boolean;
begin
  perform public.require_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'Exam data must be an object.';
  end if;
  v_series := coalesce(nullif(p_data->>'series_id', '')::uuid, v_id);
  -- The root lock serializes level creation, edits and series archival.
  if v_series <> v_id then
    select * into v_root from public.exams where id = v_series and level = 1 for update;
    if not found or v_root.archived then
      raise exception using errcode = '22023', message = 'Choose an existing, non-archived exam series.';
    end if;
  end if;
  if p_id is not null then
    select * into v_old from public.exams where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Level not found.'; end if;
  end if;
  v_level := (p_data->>'level')::integer;
  v_duration := (p_data->>'duration_minutes')::integer;
  v_marks := (p_data->>'total_marks')::numeric;
  v_negative := (p_data->>'negative_marking_rate')::numeric;
  v_published := (p_data->>'is_published')::boolean;
  if v_level is null or v_level not between 1 and 10 or
    v_duration is null or v_duration not between 1 and 480 or
    v_marks is null or v_marks <= 0 or v_marks > 10000 or
    v_negative is null or v_negative < 0 or v_negative > 1 or v_published is null or
    p_data->>'title' is null or length(trim(p_data->>'title')) not between 1 and 160 or
    length(coalesce(p_data->>'description', '')) > 4000 or
    not exists(select 1 from public.categories where id = (p_data->>'category_id')::uuid) or
    (v_level = 1) <> (v_series = v_id) then
    raise exception using errcode = '22023', message = 'Check the category, title, level (1-10), duration (1-480), marks and penalty rate (0-1).';
  end if;
  if p_id is not null and (v_old.level <> v_level or v_old.series_id <> v_series) then
    raise exception using errcode = '22023', message = 'An existing level cannot be moved or renumbered.';
  end if;
  if p_id is not null and exists(select 1 from public.exam_sessions where exam_id = p_id) and
    (v_old.total_marks <> v_marks or v_old.negative_marking_rate <> v_negative) then
    raise exception using errcode = '22023', message = 'Total marks and penalty rate are fixed after attempts start so level score comparisons remain valid. Use a new level or series for a new marking scheme.';
  end if;
  if v_published and (
    not exists(select 1 from public.questions where exam_id = v_id and not archived) or
    exists(select 1 from generate_series(1, v_level - 1) prev(n) where not exists(
      select 1 from public.exams e where e.series_id = v_series and e.level = prev.n and e.is_published and not e.archived
    ))
  ) then
    raise exception using errcode = '22023', message = 'Add questions and publish every earlier level before publishing this level.';
  end if;
  insert into public.exams(id, series_id, level, category_id, title, description,
    duration_minutes, total_marks, negative_marking_rate, is_published)
  values(v_id, v_series, v_level, (p_data->>'category_id')::uuid, trim(p_data->>'title'),
    coalesce(p_data->>'description', ''), v_duration, v_marks, v_negative, v_published)
  on conflict(id) do update set category_id = excluded.category_id, title = excluded.title,
    description = excluded.description, duration_minutes = excluded.duration_minutes,
    total_marks = excluded.total_marks, negative_marking_rate = excluded.negative_marking_rate,
    is_published = excluded.is_published, archived = false;
  if not v_published then
    update public.exams set is_published = false where series_id = v_series and level > v_level;
  end if;
  return v_id;
end;
$$;

create function public.admin_save_question(p_id uuid, p_exam_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.questions%rowtype;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_position integer;
  v_options jsonb;
begin
  perform public.require_admin();
  perform 1 from public.exams where id = p_exam_id and not archived for update;
  if not found then raise exception using errcode = 'P0002', message = 'Choose a non-archived level.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'Question data must be an object.';
  end if;
  if p_id is not null then
    select * into v_old from public.questions where id = p_id and exam_id = p_exam_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Question not found in this level.'; end if;
  end if;
  v_position := (p_data->>'position')::integer;
  v_options := p_data->'options';
  if v_position is null or v_position not between 1 and 1000 or
    p_data->>'question_text' is null or length(trim(p_data->>'question_text')) not between 1 and 12000 or
    p_data->>'topic' is null or length(trim(p_data->>'topic')) not between 1 and 100 or
    p_data->>'explanation' is null or length(trim(p_data->>'explanation')) not between 1 and 12000 or
    v_options is null or jsonb_typeof(v_options) <> 'array' then
    raise exception using errcode = '22023', message = 'Provide position, question, topic, explanation and answer options.';
  end if;
  if jsonb_array_length(v_options) <> 4 or
    (select count(distinct o->>'id') from jsonb_array_elements(v_options) o where o->>'id' in ('A','B','C','D')) <> 4 or
    exists(select 1 from jsonb_array_elements(v_options) o where jsonb_typeof(o) <> 'object' or
      jsonb_typeof(o->'text') is distinct from 'string' or length(trim(o->>'text')) not between 1 and 4000) or
    p_data->>'correct_option_id' is null or p_data->>'correct_option_id' not in ('A','B','C','D') then
    raise exception using errcode = '22023', message = 'Provide four nonempty options A-D and a correct answer A-D.';
  end if;
  if p_id is not null and exists(select 1 from public.exam_sessions where v_old.id = any(question_ids)) then
    update public.questions set archived = true where id = p_id;
    v_id := gen_random_uuid();
  end if;
  insert into public.questions(id, exam_id, position, question_text, options, correct_option_id, explanation, topic)
  values(v_id, p_exam_id, v_position, trim(p_data->>'question_text'), v_options,
    p_data->>'correct_option_id', trim(p_data->>'explanation'), trim(p_data->>'topic'))
  on conflict(id) do update set position = excluded.position, question_text = excluded.question_text,
    options = excluded.options, correct_option_id = excluded.correct_option_id,
    explanation = excluded.explanation, topic = excluded.topic, archived = false;
  return v_id;
end;
$$;

create function public.admin_archive(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_exam public.exams%rowtype; v_exam_id uuid;
begin
  perform public.require_admin();
  if p_kind = 'question' then
    select exam_id into v_exam_id from public.questions where id = p_id;
    perform 1 from public.exams where id = v_exam_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Question not found.'; end if;
    update public.questions set archived = true where id = p_id;
    if not exists(select 1 from public.questions where exam_id = v_exam_id and not archived) then
      update public.exams set is_published = false where id = v_exam_id;
      update public.exams set is_published = false
      where series_id = (select series_id from public.exams where id = v_exam_id)
        and level > (select level from public.exams where id = v_exam_id);
    end if;
  elsif p_kind in ('level', 'series') then
    select * into v_exam from public.exams where id = p_id;
    if not found then raise exception using errcode = 'P0002', message = 'Level not found.'; end if;
    perform 1 from public.exams where id = v_exam.series_id for update;
    if p_kind = 'series' then
      update public.exams set archived = true, is_published = false where series_id = v_exam.series_id;
    else
      update public.exams set archived = true, is_published = false where id = p_id;
      -- Higher levels cannot be started by new learners until this level returns.
      update public.exams set is_published = false where series_id = v_exam.series_id and level > v_exam.level;
    end if;
  else
    raise exception using errcode = '22023', message = 'Choose question, level or series to archive.';
  end if;
end;
$$;

-- Catalog and new sessions ignore archived question versions. Existing session
-- IDs still resolve the original text, keys and explanations during scoring.
create or replace function public.get_catalog_without_levels()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'category_id', e.category_id, 'title', e.title, 'description', e.description,
    'duration_minutes', e.duration_minutes, 'total_marks', e.total_marks,
    'negative_marking_rate', e.negative_marking_rate,
    'question_count', (select count(*) from public.questions q where q.exam_id = e.id and not q.archived),
    'categories', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon)
  ) order by e.created_at, e.title), '[]'::jsonb)
  from public.exams e join public.categories c on c.id = e.category_id
  where e.is_published and not e.archived;
$$;

create or replace function public.start_exam_without_levels(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_exam public.exams%rowtype;
  v_session public.exam_sessions%rowtype;
  v_question_ids uuid[];
  v_questions jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to start a test.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_exam_id::text, 0));
  select * into v_exam from public.exams e where id = p_exam_id and (
    (is_published and not archived) or exists(select 1 from public.exam_sessions s
      where s.exam_id = e.id and s.user_id = v_user_id and s.status = 'active')
  ) for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'This mock test is not available.';
  end if;
  select * into v_session from public.exam_sessions
    where user_id = v_user_id and exam_id = p_exam_id and status = 'active'
    order by started_at desc limit 1 for update;
  if not found then
    select array_agg(q.id order by q.position) into v_question_ids from public.questions q
      where q.exam_id = p_exam_id and not q.archived;
    if coalesce(cardinality(v_question_ids), 0) = 0 then
      raise exception using errcode = 'P0002', message = 'This mock test does not have any questions yet.';
    end if;
    insert into public.exam_sessions(user_id, exam_id, question_ids, expires_at, duration_minutes, total_marks, negative_marking_rate)
    values(v_user_id, p_exam_id, v_question_ids, now() + make_interval(mins => v_exam.duration_minutes),
      v_exam.duration_minutes, v_exam.total_marks, v_exam.negative_marking_rate)
    returning * into v_session;
  end if;
  select jsonb_agg(jsonb_build_object('id', q.id, 'question_text', q.question_text,
    'options', q.options, 'topic', q.topic) order by array_position(v_session.question_ids, q.id))
  into v_questions from public.questions q where q.id = any(v_session.question_ids);
  return jsonb_build_object('id', v_session.id, 'exam_id', v_session.exam_id,
    'started_at', v_session.started_at, 'expires_at', v_session.expires_at,
    'duration_minutes', v_session.duration_minutes, 'total_marks', v_session.total_marks,
    'negative_marking_rate', v_session.negative_marking_rate,
    'questions', v_questions, 'answers_json', v_session.answers_json, 'review_ids', to_jsonb(v_session.review_ids));
end;
$$;

create or replace function public.start_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_exam public.exams%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Sign in to start a test.';
  end if;
  if exists(select 1 from public.exam_sessions where exam_id = p_exam_id and user_id = auth.uid() and status = 'active') then
    return public.start_exam_without_levels(p_exam_id);
  end if;
  select * into v_exam from public.exams where id = p_exam_id and is_published and not archived;
  if not found then raise exception using errcode = 'P0002', message = 'This mock test is not available.'; end if;
  if exists(select 1 from generate_series(1, v_exam.level - 1) previous(level) where not exists(
    select 1 from public.exams prerequisite join public.submissions s
      on s.exam_id = prerequisite.id and s.user_id = auth.uid()
    where prerequisite.series_id = v_exam.series_id and prerequisite.level = previous.level
  )) then
    raise exception using errcode = '42501', message = 'Complete all earlier levels of this exam before starting this level.';
  end if;
  return public.start_exam_without_levels(p_exam_id);
end;
$$;

create function public.get_exam_details(p_exam_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_catalog jsonb; v_exam jsonb; v_series uuid;
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'Sign in to view this test.'; end if;
  v_catalog := public.get_catalog();
  select item into v_exam from jsonb_array_elements(v_catalog) item where item->>'id' = p_exam_id::text;
  select e.series_id into v_series from public.exams e where e.id = p_exam_id;
  if exists(select 1 from public.exam_sessions where exam_id = p_exam_id and user_id = auth.uid() and status = 'active') then
    select jsonb_build_object(
      'id', e.id, 'series_id', e.series_id, 'level', e.level, 'category_id', e.category_id,
      'title', e.title, 'description', e.description,
      'duration_minutes', s.duration_minutes, 'total_marks', s.total_marks,
      'negative_marking_rate', s.negative_marking_rate, 'question_count', cardinality(s.question_ids),
      'unlocked', true, 'completed', false, 'best_score', null, 'latest_score', null, 'latest_result_id', null,
      'categories', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon)
    ) into v_exam from public.exams e join public.categories c on c.id = e.category_id
      join public.exam_sessions s on s.exam_id = e.id and s.user_id = auth.uid() and s.status = 'active'
      where e.id = p_exam_id;
  end if;
  if v_exam is null then raise exception using errcode = 'P0002', message = 'This mock test is not available.'; end if;
  return jsonb_build_object('exam', v_exam, 'levels', coalesce((
    select jsonb_agg(item) from jsonb_array_elements(v_catalog) item where item->>'series_id' = v_series::text
  ), '[]'::jsonb));
end;
$$;

create or replace function public.submit_exam(p_session_id uuid, p_answers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.exam_sessions%rowtype;
  v_question public.questions%rowtype;
  v_answers jsonb;
  v_attempted integer := 0;
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_question_count integer;
  v_score numeric(8,2) := 0;
  v_accuracy numeric(6,2) := 0;
  v_now timestamptz;
  v_submission_id uuid;
  v_marks_per_question numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to submit a test.';
  end if;
  select * into v_session from public.exam_sessions where id = p_session_id and user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Test session not found.'; end if;
  if v_session.status = 'completed' then
    select id into v_submission_id from public.submissions where session_id = v_session.id;
    return v_submission_id;
  end if;
  v_now := clock_timestamp();
  if v_now < v_session.expires_at then
    perform public.save_exam_progress(p_session_id, p_answers, v_session.review_ids);
    select * into v_session from public.exam_sessions where id = p_session_id;
  end if;
  v_answers := v_session.answers_json;
  select count(*) into v_question_count from public.questions where id = any(v_session.question_ids);
  if v_question_count = 0 then
    raise exception using errcode = 'P0002', message = 'The questions for this test are no longer available.';
  end if;
  v_marks_per_question := v_session.total_marks / v_question_count;
  for v_question in select * from public.questions where id = any(v_session.question_ids)
    order by array_position(v_session.question_ids, id)
  loop
    if v_answers ? v_question.id::text then
      v_attempted := v_attempted + 1;
      if v_answers->>v_question.id::text = v_question.correct_option_id then
        v_correct := v_correct + 1; v_score := v_score + v_marks_per_question;
      else
        v_incorrect := v_incorrect + 1;
        v_score := v_score - v_marks_per_question * v_session.negative_marking_rate;
      end if;
    end if;
  end loop;
  if v_attempted > 0 then v_accuracy := round(v_correct::numeric * 100 / v_attempted, 2); end if;
  v_now := least(v_now, v_session.expires_at);
  insert into public.submissions(session_id, user_id, exam_id, score, total_marks, accuracy_percentage,
    time_taken_seconds, attempted_count, correct_count, incorrect_count, answers_json, submitted_at)
  values(v_session.id, v_user_id, v_session.exam_id, round(v_score,2), v_session.total_marks, v_accuracy,
    greatest(0, least(v_session.duration_minutes * 60, floor(extract(epoch from (v_now-v_session.started_at)))::integer)),
    v_attempted, v_correct, v_incorrect, v_answers, v_now)
  returning id into v_submission_id;
  update public.exam_sessions set status = 'completed', submitted_at = v_now where id = v_session.id;
  return v_submission_id;
end;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.get_exam_details(uuid) from public;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.record_guest_visit(uuid) from public;
revoke all on function public.admin_overview() from public;
revoke all on function public.admin_users_list(text, integer) from public;
revoke all on function public.admin_attempts(uuid, integer) from public;
revoke all on function public.admin_result(uuid) from public;
revoke all on function public.admin_content(uuid) from public;
revoke all on function public.admin_save_category(uuid, text, text, text) from public;
revoke all on function public.admin_save_exam(uuid, jsonb) from public;
revoke all on function public.admin_save_question(uuid, uuid, jsonb) from public;
revoke all on function public.admin_archive(text, uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_exam_details(uuid) to authenticated;
grant execute on function public.record_guest_visit(uuid) to anon, authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_users_list(text, integer) to authenticated;
grant execute on function public.admin_attempts(uuid, integer) to authenticated;
grant execute on function public.admin_result(uuid) to authenticated;
grant execute on function public.admin_content(uuid) to authenticated;
grant execute on function public.admin_save_category(uuid, text, text, text) to authenticated;
grant execute on function public.admin_save_exam(uuid, jsonb) to authenticated;
grant execute on function public.admin_save_question(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_archive(text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
