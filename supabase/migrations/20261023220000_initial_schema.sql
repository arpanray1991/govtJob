create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text not null default 'landmark'
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  total_marks numeric(8, 2) not null check (total_marks > 0),
  negative_marking_rate numeric(5, 4) not null default 0 check (negative_marking_rate >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_text text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_option_id text not null,
  explanation text not null default '',
  topic text not null default 'General',
  position integer not null check (position > 0),
  unique (exam_id, position)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 80),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048)
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete restrict,
  question_ids uuid[] not null,
  answers_json jsonb not null default '{}'::jsonb check (jsonb_typeof(answers_json) = 'object'),
  review_ids uuid[] not null default '{}'::uuid[],
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  submitted_at timestamptz
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.exam_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete restrict,
  score numeric(8, 2) not null,
  total_marks numeric(8, 2) not null,
  accuracy_percentage numeric(6, 2) not null,
  time_taken_seconds integer not null check (time_taken_seconds >= 0),
  attempted_count integer not null check (attempted_count >= 0),
  correct_count integer not null check (correct_count >= 0),
  incorrect_count integer not null check (incorrect_count >= 0),
  answers_json jsonb not null check (jsonb_typeof(answers_json) = 'object'),
  submitted_at timestamptz not null default now()
);

create index if not exists exams_category_id_idx on public.exams(category_id);
create index if not exists questions_exam_position_idx on public.questions(exam_id, position);
create index if not exists exam_sessions_user_exam_idx on public.exam_sessions(user_id, exam_id, started_at desc);
create unique index if not exists exam_sessions_one_active_idx on public.exam_sessions(user_id, exam_id) where status = 'active';
create index if not exists submissions_exam_rank_idx on public.submissions(exam_id, score desc, time_taken_seconds, submitted_at);
create index if not exists submissions_user_history_idx on public.submissions(user_id, submitted_at desc);

alter table public.categories enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.profiles enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "Published categories are readable" on public.categories;
create policy "Published categories are readable"
  on public.categories for select to anon, authenticated using (
    exists (
      select 1 from public.exams
      where exams.category_id = categories.id and exams.is_published
    )
  );

drop policy if exists "Published exams are readable" on public.exams;
create policy "Published exams are readable"
  on public.exams for select to anon, authenticated using (is_published);

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.categories, public.exams to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name)
select
  id,
  left(coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1)), 80)
from auth.users
on conflict (id) do nothing;

create or replace function public.get_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'category_id', e.category_id,
        'title', e.title,
        'description', e.description,
        'duration_minutes', e.duration_minutes,
        'total_marks', e.total_marks,
        'negative_marking_rate', e.negative_marking_rate,
        'question_count', (
          select count(*) from public.questions q where q.exam_id = e.id
        ),
        'categories', jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'slug', c.slug,
          'icon', c.icon
        )
      )
      order by e.created_at, e.title
    ),
    '[]'::jsonb
  )
  from public.exams e
  join public.categories c on c.id = e.category_id
  where e.is_published;
$$;

create or replace function public.start_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select * into v_exam
  from public.exams
  where id = p_exam_id and is_published;
  if not found then
    raise exception using errcode = 'P0002', message = 'This mock test is not available.';
  end if;

  select * into v_session
  from public.exam_sessions
  where user_id = v_user_id and exam_id = p_exam_id and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    select array_agg(q.id order by q.position) into v_question_ids
    from public.questions q
    where q.exam_id = p_exam_id;

    if coalesce(cardinality(v_question_ids), 0) = 0 then
      raise exception using errcode = 'P0002', message = 'This mock test does not have any questions yet.';
    end if;

    insert into public.exam_sessions (user_id, exam_id, question_ids, expires_at)
    values (
      v_user_id,
      p_exam_id,
      v_question_ids,
      now() + make_interval(mins => v_exam.duration_minutes)
    )
    returning * into v_session;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'options', q.options,
        'topic', q.topic
      )
      order by array_position(v_session.question_ids, q.id)
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.questions q
  where q.id = any(v_session.question_ids);

  return jsonb_build_object(
    'id', v_session.id,
    'exam_id', v_session.exam_id,
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at,
    'questions', v_questions,
    'answers_json', v_session.answers_json,
    'review_ids', to_jsonb(v_session.review_ids)
  );
end;
$$;

create or replace function public.save_exam_progress(
  p_session_id uuid,
  p_answers jsonb,
  p_review_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.exam_sessions%rowtype;
  v_answer record;
  v_question_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to save test progress.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception using errcode = '22023', message = 'Answers must be a JSON object.';
  end if;

  select * into v_session
  from public.exam_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Test session not found.';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '22023', message = 'This test has already been submitted.';
  end if;
  if clock_timestamp() >= v_session.expires_at then
    raise exception using errcode = '22023', message = 'Time is up; progress can no longer be changed.';
  end if;

  for v_answer in select key, value from jsonb_each_text(p_answers)
  loop
    if v_answer.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'An answer references an invalid question.';
    end if;
    v_question_id := v_answer.key::uuid;
    if not (v_question_id = any(v_session.question_ids)) then
      raise exception using errcode = '22023', message = 'An answer references a question outside this test.';
    end if;
    if not exists (
      select 1
      from public.questions q
      cross join lateral jsonb_array_elements(q.options) as opt(value)
      where q.id = v_question_id and opt.value ->> 'id' = v_answer.value
    ) then
      raise exception using errcode = '22023', message = 'An answer references an invalid option.';
    end if;
  end loop;

  if exists (
    select 1 from unnest(coalesce(p_review_ids, '{}'::uuid[])) as review(review_id)
    where not (review.review_id = any(v_session.question_ids))
  ) then
    raise exception using errcode = '22023', message = 'A review marker references a question outside this test.';
  end if;

  update public.exam_sessions
  set answers_json = p_answers,
      review_ids = coalesce(p_review_ids, '{}'::uuid[])
  where id = p_session_id;
end;
$$;

create or replace function public.submit_exam(p_session_id uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.exam_sessions%rowtype;
  v_exam public.exams%rowtype;
  v_question public.questions%rowtype;
  v_answers jsonb;
  v_attempted integer := 0;
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_question_count integer;
  v_score numeric(8, 2) := 0;
  v_accuracy numeric(6, 2) := 0;
  v_now timestamptz;
  v_submission_id uuid;
  v_marks_per_question numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to submit a test.';
  end if;

  select * into v_session
  from public.exam_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Test session not found.';
  end if;

  if v_session.status = 'completed' then
    select id into v_submission_id
    from public.submissions
    where session_id = v_session.id;
    return v_submission_id;
  end if;

  v_now := clock_timestamp();
  if v_now < v_session.expires_at then
    perform public.save_exam_progress(p_session_id, p_answers, v_session.review_ids);
    select * into v_session from public.exam_sessions where id = p_session_id;
    v_answers := v_session.answers_json;
  else
    v_answers := v_session.answers_json;
  end if;

  select * into v_exam from public.exams where id = v_session.exam_id;
  select count(*) into v_question_count
  from public.questions
  where id = any(v_session.question_ids);
  if v_question_count = 0 then
    raise exception using errcode = 'P0002', message = 'The questions for this test are no longer available.';
  end if;
  v_marks_per_question := v_exam.total_marks / v_question_count;

  for v_question in
    select q.* from public.questions q
    where q.id = any(v_session.question_ids)
    order by array_position(v_session.question_ids, q.id)
  loop
    if v_answers ? v_question.id::text then
      v_attempted := v_attempted + 1;
      if v_answers ->> v_question.id::text = v_question.correct_option_id then
        v_correct := v_correct + 1;
        v_score := v_score + v_marks_per_question;
      else
        v_incorrect := v_incorrect + 1;
        v_score := v_score - (v_marks_per_question * v_exam.negative_marking_rate);
      end if;
    end if;
  end loop;

  if v_attempted > 0 then
    v_accuracy := round(v_correct::numeric * 100 / v_attempted, 2);
  end if;
  v_score := round(v_score, 2);
  v_now := least(v_now, v_session.expires_at);

  insert into public.submissions (
    session_id, user_id, exam_id, score, total_marks, accuracy_percentage,
    time_taken_seconds, attempted_count, correct_count, incorrect_count, answers_json, submitted_at
  )
  values (
    v_session.id,
    v_user_id,
    v_session.exam_id,
    v_score,
    v_exam.total_marks,
    v_accuracy,
    greatest(0, least(v_exam.duration_minutes * 60, floor(extract(epoch from (v_now - v_session.started_at)))::integer)),
    v_attempted,
    v_correct,
    v_incorrect,
    v_answers,
    v_now
  )
  returning id into v_submission_id;

  update public.exam_sessions
  set status = 'completed', submitted_at = v_now
  where id = v_session.id;

  return v_submission_id;
end;
$$;

create or replace function public.get_result(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.submissions%rowtype;
  v_exam_title text;
  v_questions jsonb;
  v_rank integer;
  v_total_participants integer;
  v_percentile numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to view test results.';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id and user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Test result not found.';
  end if;

  select title into v_exam_title from public.exams where id = v_submission.exam_id;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'options', q.options,
        'topic', q.topic,
        'correct_option_id', q.correct_option_id,
        'explanation', q.explanation
      )
      order by array_position(s.question_ids, q.id)
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.exam_sessions s
  join public.questions q on q.id = any(s.question_ids)
  where s.id = v_submission.session_id;

  with best_attempts as (
    select distinct on (user_id)
      user_id,
      score,
      time_taken_seconds,
      submitted_at
    from public.submissions
    where exam_id = v_submission.exam_id
    order by user_id, score desc, time_taken_seconds, submitted_at
  ),
  ranked as (
    select
      user_id,
      row_number() over (order by score desc, time_taken_seconds, submitted_at, user_id)::integer as user_rank,
      count(*) over ()::integer as participants
    from best_attempts
  )
  select user_rank, participants
  into v_rank, v_total_participants
  from ranked
  where user_id = v_user_id;

  v_percentile := case
    when coalesce(v_total_participants, 0) = 0 then 0
    else round((v_total_participants - v_rank)::numeric * 100 / v_total_participants, 1)
  end;

  return jsonb_build_object(
    'id', v_submission.id,
    'exam_id', v_submission.exam_id,
    'exam_title', v_exam_title,
    'score', v_submission.score,
    'total_marks', v_submission.total_marks,
    'accuracy_percentage', v_submission.accuracy_percentage,
    'time_taken_seconds', v_submission.time_taken_seconds,
    'attempted_count', v_submission.attempted_count,
    'correct_count', v_submission.correct_count,
    'incorrect_count', v_submission.incorrect_count,
    'answers_json', v_submission.answers_json,
    'questions', v_questions,
    'submitted_at', v_submission.submitted_at,
    'rank', coalesce(v_rank, 0),
    'total_participants', coalesce(v_total_participants, 0),
    'percentile', coalesce(v_percentile, 0)
  );
end;
$$;

create or replace function public.get_leaderboard(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entries jsonb;
  v_current_user jsonb;
  v_total integer := 0;
begin
  if not exists (
    select 1 from public.exams where id = p_exam_id and is_published
  ) then
    raise exception using errcode = 'P0002', message = 'This leaderboard is not available.';
  end if;

  with best_attempts as (
    select distinct on (s.user_id)
      s.user_id,
      coalesce(nullif(p.full_name, ''), 'Aspirant') as full_name,
      s.score,
      s.time_taken_seconds,
      s.submitted_at
    from public.submissions s
    left join public.profiles p on p.id = s.user_id
    where s.exam_id = p_exam_id
    order by s.user_id, s.score desc, s.time_taken_seconds, s.submitted_at
  ),
  ranked as (
    select
      user_id,
      full_name,
      score,
      time_taken_seconds,
      submitted_at,
      row_number() over (order by score desc, time_taken_seconds, submitted_at, user_id)::integer as user_rank
    from best_attempts
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'full_name', full_name,
          'score', score,
          'time_taken_seconds', time_taken_seconds,
          'submitted_at', submitted_at,
          'rank', user_rank
        )
        order by user_rank
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_entries, v_total
  from ranked;

  with best_attempts as (
    select distinct on (s.user_id)
      s.user_id,
      coalesce(nullif(p.full_name, ''), 'Aspirant') as full_name,
      s.score,
      s.time_taken_seconds,
      s.submitted_at
    from public.submissions s
    left join public.profiles p on p.id = s.user_id
    where s.exam_id = p_exam_id
    order by s.user_id, s.score desc, s.time_taken_seconds, s.submitted_at
  ),
  ranked as (
    select
      user_id,
      full_name,
      score,
      time_taken_seconds,
      submitted_at,
      row_number() over (order by score desc, time_taken_seconds, submitted_at, user_id)::integer as user_rank
    from best_attempts
  )
  select jsonb_build_object(
    'user_id', user_id,
    'full_name', full_name,
    'score', score,
    'time_taken_seconds', time_taken_seconds,
    'submitted_at', submitted_at,
    'rank', user_rank
  )
  into v_current_user
  from ranked
  where user_id = auth.uid();

  return jsonb_build_object(
    'entries', v_entries,
    'current_user', v_current_user,
    'total_participants', v_total
  );
end;
$$;

create or replace function public.get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_tests integer := 0;
  v_average_score numeric(6, 2) := 0;
  v_average_accuracy numeric(6, 2) := 0;
  v_overall_rank integer;
  v_history jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to view your dashboard.';
  end if;

  select
    count(*)::integer,
    coalesce(round(avg(score * 100 / nullif(total_marks, 0)), 1), 0),
    coalesce(round(avg(accuracy_percentage), 1), 0)
  into v_total_tests, v_average_score, v_average_accuracy
  from public.submissions
  where user_id = v_user_id;

  with best_per_exam as (
    select distinct on (user_id, exam_id)
      user_id,
      exam_id,
      score * 100 / nullif(total_marks, 0) as score_percentage,
      time_taken_seconds,
      submitted_at
    from public.submissions
    order by user_id, exam_id, score * 100 / nullif(total_marks, 0) desc, time_taken_seconds, submitted_at
  ),
  user_scores as (
    select
      user_id,
      avg(score_percentage) as average_percentage,
      avg(time_taken_seconds) as average_time
    from best_per_exam
    group by user_id
  ),
  ranked as (
    select user_id, row_number() over (
      order by average_percentage desc, average_time, user_id
    )::integer as user_rank
    from user_scores
  )
  select user_rank into v_overall_rank
  from ranked
  where user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'exam_id', s.exam_id,
        'exam_title', e.title,
        'score', s.score,
        'total_marks', s.total_marks,
        'accuracy_percentage', s.accuracy_percentage,
        'submitted_at', s.submitted_at
      )
      order by s.submitted_at desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select * from public.submissions
    where user_id = v_user_id
    order by submitted_at desc
    limit 100
  ) s
  join public.exams e on e.id = s.exam_id;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'total_tests', v_total_tests,
      'average_score', v_average_score,
      'average_accuracy', v_average_accuracy,
      'overall_rank', v_overall_rank
    ),
    'history', v_history
  );
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.get_catalog() from public;
revoke all on function public.start_exam(uuid) from public;
revoke all on function public.save_exam_progress(uuid, jsonb, uuid[]) from public;
revoke all on function public.submit_exam(uuid, jsonb) from public;
revoke all on function public.get_result(uuid) from public;
revoke all on function public.get_leaderboard(uuid) from public;
revoke all on function public.get_dashboard() from public;

grant execute on function public.get_catalog() to anon, authenticated;
grant execute on function public.start_exam(uuid) to authenticated;
grant execute on function public.save_exam_progress(uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.submit_exam(uuid, jsonb) to authenticated;
grant execute on function public.get_result(uuid) to authenticated;
grant execute on function public.get_leaderboard(uuid) to anon, authenticated;
grant execute on function public.get_dashboard() to authenticated;

insert into public.categories (id, name, slug, icon) values
  ('10000000-0000-0000-0000-000000000001', 'SSC', 'ssc', 'landmark'),
  ('10000000-0000-0000-0000-000000000002', 'Banking', 'banking', 'building')
on conflict (id) do update
set name = excluded.name, slug = excluded.slug, icon = excluded.icon;

insert into public.exams (
  id, category_id, title, description, duration_minutes, total_marks, negative_marking_rate, is_published
) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'SSC CGL · Foundation Mock',
    'Build your foundation with a focused mix of quantitative aptitude, reasoning, English and general awareness.',
    10, 10, 0.25, true
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'IBPS PO · Prelims Practice',
    'Sharpen your speed and accuracy with exam-style numerical ability, logical reasoning and English questions.',
    10, 5, 0.25, true
  )
on conflict (id) do update
set category_id = excluded.category_id,
    title = excluded.title,
    description = excluded.description,
    duration_minutes = excluded.duration_minutes,
    total_marks = excluded.total_marks,
    negative_marking_rate = excluded.negative_marking_rate,
    is_published = excluded.is_published;

insert into public.questions (id, exam_id, question_text, options, correct_option_id, explanation, topic, position) values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'What is 15% of 240?',
    '[{"id":"A","text":"24"},{"id":"B","text":"30"},{"id":"C","text":"36"},{"id":"D","text":"40"}]'::jsonb,
    'C', '15% of 240 is 0.15 × 240 = 36.', 'Quantitative Aptitude', 1
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Find the next number in the sequence: 2, 6, 12, 20, 30, __.',
    '[{"id":"A","text":"36"},{"id":"B","text":"40"},{"id":"C","text":"42"},{"id":"D","text":"44"}]'::jsonb,
    'C', 'The differences are 4, 6, 8, and 10. The next difference is 12, so the next number is 42.', 'Reasoning', 2
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'Choose the word closest in meaning to “abundant.”',
    '[{"id":"A","text":"Scarce"},{"id":"B","text":"Plentiful"},{"id":"C","text":"Fragile"},{"id":"D","text":"Brief"}]'::jsonb,
    'B', '“Abundant” means existing in large quantities; “plentiful” is a close synonym.', 'English', 3
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    'On which date did the Constitution of India come into effect?',
    '[{"id":"A","text":"15 August 1947"},{"id":"B","text":"26 November 1949"},{"id":"C","text":"26 January 1950"},{"id":"D","text":"2 October 1950"}]'::jsonb,
    'C', 'The Constitution of India came into effect on 26 January 1950.', 'General Awareness', 4
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    'A sum of 64 is divided in the ratio 3:5. What is the smaller share?',
    '[{"id":"A","text":"16"},{"id":"B","text":"24"},{"id":"C","text":"32"},{"id":"D","text":"40"}]'::jsonb,
    'B', 'There are 3 + 5 = 8 equal parts. Each part is 64 ÷ 8 = 8; the smaller share is 3 × 8 = 24.', 'Quantitative Aptitude', 5
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000002',
    'Evaluate 48 ÷ 6 × 2.',
    '[{"id":"A","text":"4"},{"id":"B","text":"8"},{"id":"C","text":"16"},{"id":"D","text":"24"}]'::jsonb,
    'C', 'Division and multiplication have equal precedence and are evaluated from left to right: 48 ÷ 6 × 2 = 16.', 'Quantitative Aptitude', 1
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000002',
    'Find the next number in the sequence: 3, 6, 12, 24, __.',
    '[{"id":"A","text":"30"},{"id":"B","text":"36"},{"id":"C","text":"42"},{"id":"D","text":"48"}]'::jsonb,
    'D', 'Each term is twice the previous term, so 24 × 2 = 48.', 'Reasoning', 2
  ),
  (
    '30000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000002',
    'What is 20% of 350?',
    '[{"id":"A","text":"60"},{"id":"B","text":"65"},{"id":"C","text":"70"},{"id":"D","text":"75"}]'::jsonb,
    'C', '20% is one fifth; 350 ÷ 5 = 70.', 'Quantitative Aptitude', 3
  ),
  (
    '30000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000002',
    'Choose the word opposite in meaning to “expand.”',
    '[{"id":"A","text":"Enlarge"},{"id":"B","text":"Extend"},{"id":"C","text":"Contract"},{"id":"D","text":"Increase"}]'::jsonb,
    'C', '“Contract” means to become smaller, the opposite of “expand.”', 'English', 4
  ),
  (
    '30000000-0000-0000-0000-000000000010',
    '20000000-0000-0000-0000-000000000002',
    'A is taller than B, and B is taller than C. Who is the shortest?',
    '[{"id":"A","text":"A"},{"id":"B","text":"B"},{"id":"C","text":"C"},{"id":"D","text":"Cannot be determined"}]'::jsonb,
    'C', 'Since A is taller than B and B is taller than C, C is the shortest.', 'Reasoning', 5
  )
on conflict (id) do update
set exam_id = excluded.exam_id,
    question_text = excluded.question_text,
    options = excluded.options,
    correct_option_id = excluded.correct_option_id,
    explanation = excluded.explanation,
    topic = excluded.topic,
    position = excluded.position;

notify pgrst, 'reload schema';
