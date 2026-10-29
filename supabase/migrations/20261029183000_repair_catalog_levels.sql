begin;

create or replace function public.get_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'series_id', e.series_id,
      'level', e.level,
      'completed', best.id is not null,
      'best_score', best.score,
      'latest_score', latest.score,
      'latest_result_id', latest.id,
      'unlocked', not exists (
        select 1 from generate_series(1, e.level - 1) previous(level)
        where not exists (
          select 1 from public.exams prerequisite
          join public.submissions s on s.exam_id = prerequisite.id and s.user_id = auth.uid()
          where prerequisite.series_id = e.series_id and prerequisite.level = previous.level
        )
      )
    ) order by e.series_id, e.level
  ), '[]'::jsonb)
  from jsonb_array_elements(public.get_catalog_without_levels()) item
  join public.exams e on e.id = (item->>'id')::uuid
  left join lateral (
    select s.id, s.score from public.submissions s
    where s.exam_id = e.id and s.user_id = auth.uid()
    order by s.score desc, s.time_taken_seconds, s.submitted_at, s.id limit 1
  ) best on true
  left join lateral (
    select s.id, s.score from public.submissions s
    where s.exam_id = e.id and s.user_id = auth.uid()
    order by s.submitted_at desc, s.id desc limit 1
  ) latest on true;
$$;

revoke all on function public.get_catalog() from public;
grant execute on function public.get_catalog() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
