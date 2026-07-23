-- Deadlines tracker: mark a course_event (quiz/assignment/exam) done.
-- Applied via migration `add_course_events_done`.
alter table public.course_events
  add column if not exists done boolean not null default false;
