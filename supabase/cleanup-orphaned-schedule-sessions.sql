-- ONE-TIME cleanup for existing users (applied via migration
-- `cleanup_orphaned_schedule_sessions`), paired with the going-forward fix in
-- fix-schedule-reprojection.sql.
--
-- The pre-fix schedule-edit bug left FUTURE classes with schedule_id NULL (the
-- FK is ON DELETE SET NULL), which the regenerator couldn't clear -- so stale
-- old-schedule classes piled up. This sweeps them, touching only FUTURE, UNMARKED
-- sessions (past + marked history is never touched):
--
--   1) Re-link orphans that still match the CURRENT schedule -- real current
--      classes that lost their link and were blocked from regeneration by the
--      on-conflict rule. Recovered, not deleted.  (466 rows)
--   2) Delete the remaining weekly-RECURRING orphans -- old-schedule leftovers not
--      on the current schedule.  (145 rows)
--   One-off "extra" classes are non-recurring and preserved.  (23 rows)
--
-- Verified after run: 0 recurring orphans remain, 23 one-offs kept, 284 marked
-- sessions intact, past sessions untouched.

update public.sessions se
set schedule_id = cs.id
from public.course_schedule cs
where se.schedule_id is null
  and se.status = 'scheduled'
  and se.session_date >= current_date
  and cs.course_id = se.course_id
  and cs.start_time = se.start_time
  and cs.end_time = se.end_time
  and cs.component_type = se.component_type
  and cs.day_of_week = ((extract(dow from se.session_date)::int + 6) % 7)
  and not exists (select 1 from public.attendance_records a where a.session_id = se.id);

with cand as (
  select se.id, se.course_id, se.start_time, se.end_time, se.component_type,
         extract(dow from se.session_date)::int as dow
  from public.sessions se
  where se.schedule_id is null and se.status = 'scheduled' and se.session_date >= current_date
    and not exists (select 1 from public.attendance_records a where a.session_id = se.id)
),
recurring as (
  select course_id, dow, start_time, end_time, component_type
  from cand group by course_id, dow, start_time, end_time, component_type
  having count(*) >= 2
)
delete from public.sessions se
where se.id in (
  select c.id from cand c join recurring r
    on r.course_id=c.course_id and r.dow=c.dow and r.start_time=c.start_time
   and r.end_time=c.end_time and r.component_type=c.component_type
);
