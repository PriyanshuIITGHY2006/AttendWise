-- Fix: editing a course's weekly schedule left the OLD schedule's future classes
-- in place alongside the new ones. Cause: replaceSchedule deleted the old
-- course_schedule rows, and the sessions.schedule_id FK is ON DELETE SET NULL,
-- so every session's schedule_id became NULL BEFORE the regenerator ran -- and
-- the regenerator only clears future, unmarked sessions with schedule_id IS NOT
-- NULL. The stale future classes therefore survived (and looked like one-off
-- "extra" classes).
--
-- Fix: do the whole swap in one RPC, in the right order -- clear future unmarked
-- generated sessions while the link is intact, then replace the schedule, then
-- regenerate. Marked/past classes are preserved; "extra" one-offs (schedule_id
-- null by design) survive. Verified with a throwaway course: a marked future
-- class off the new schedule is kept, old-schedule future unmarked classes are
-- removed, new-schedule future classes are created.
create or replace function public.set_course_schedule(p_course_id uuid, p_slots jsonb)
returns void language plpgsql set search_path to 'public'
as $function$
declare s jsonb;
begin
  if not exists (select 1 from courses where id = p_course_id and user_id = auth.uid()) then
    raise exception 'course not found or not owned by current user';
  end if;

  delete from sessions se
  where se.course_id = p_course_id
    and se.status = 'scheduled'
    and se.schedule_id is not null
    and se.session_date >= current_date
    and not exists (select 1 from attendance_records a where a.session_id = se.id);

  delete from course_schedule where course_id = p_course_id;
  if p_slots is not null then
    for s in select * from jsonb_array_elements(p_slots) loop
      insert into course_schedule (course_id, day_of_week, start_time, end_time, component_type, room)
      values (p_course_id, (s->>'day_of_week')::int, (s->>'start_time')::time,
              (s->>'end_time')::time, s->>'component_type', nullif(s->>'room',''));
    end loop;
  end if;

  perform public.generate_sessions_for_course(p_course_id);
end;
$function$;

revoke execute on function public.set_course_schedule(uuid, jsonb) from public, anon;
grant execute on function public.set_course_schedule(uuid, jsonb) to authenticated;
