-- AttendWise v2: a clean schema for the native app.
--
-- It lives in its own `v2` schema inside the existing project, next to the
-- old web app's `public` tables, so the old app keeps working until v2
-- launches and accounts (including Google sign-in) carry over.
--
-- Sync model: every user row has `updated_at` (always set by the server) and,
-- where rows can be deleted, `deleted_at` (soft delete, so deletions sync).
-- Clients pull rows with updated_at greater than their last cursor.

create schema if not exists v2;
grant usage on schema v2 to anon, authenticated, service_role;

create or replace function v2.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles -------------------------------------------------------------------

create table v2.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  is_first_year_ug boolean not null default false,
  humor_level text not null default 'roast' check (humor_level in ('roast', 'plain', 'kuchupuchu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Semesters ------------------------------------------------------------------

create table v2.semesters (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date not null,
  end_date date not null,
  mid_sem_start date,
  mid_sem_end date,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date),
  check ((mid_sem_start is null) = (mid_sem_end is null)),
  check (mid_sem_start is null or (mid_sem_end >= mid_sem_start and mid_sem_start >= start_date and mid_sem_end <= end_date))
);

-- Courses --------------------------------------------------------------------

create table v2.courses (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semester_id uuid not null references v2.semesters (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#4F46E5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  threshold_percent smallint not null default 75 check (threshold_percent between 0 and 100),
  strict_no_skip boolean not null default false,
  term text not null default 'full' check (term in ('full', 'pre_mid', 'post_mid')),
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Timetable slots (versioned: edits close a slot and open a new one) ---------

create table v2.timetable_slots (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references v2.courses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
  start_time time not null,
  end_time time not null,
  room text check (char_length(room) <= 40),
  kind text not null default 'lecture' check (kind in ('lecture', 'tutorial', 'lab')),
  valid_from date,
  valid_to date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_time > start_time),
  check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

-- Extra / makeup classes -----------------------------------------------------

create table v2.extra_classes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references v2.courses (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  room text check (char_length(room) <= 40),
  kind text not null default 'lecture' check (kind in ('lecture', 'tutorial', 'lab')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_time > start_time)
);

-- Marks: one per class, keyed by the class itself so devices merge cleanly ----

create table v2.marks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references v2.courses (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time,
  status text not null check (status in ('present', 'absent', 'cancelled', 'on_duty')),
  plan_id uuid,
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, course_id, date, start_time)
);

-- Notification settings ------------------------------------------------------

create table v2.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  muted boolean not null default false,
  class_reminders boolean not null default true,
  lead_time_minutes smallint not null default 10 check (lead_time_minutes between 0 and 180),
  mark_prompts boolean not null default true,
  daily_digest boolean not null default true,
  digest_time time not null default '21:00',
  planned_skip_reminders boolean not null default true,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now()
);

-- Institute calendar (shared, read-only for students) -------------------------

create table v2.institute_calendar (
  id bigint generated always as identity primary key,
  date date not null,
  day_type text not null check (day_type in ('holiday', 'mid_sem_break', 'end_sem_break', 'exam', 'reschedule')),
  description text,
  follows_day_of_week smallint check (follows_day_of_week between 1 and 7), -- ISO: 1 = Monday
  audience text not null default 'all' check (audience in ('all', 'first_year_ug')),
  updated_at timestamptz not null default now(),
  unique (date, audience, day_type)
);

-- updated_at is always the server's clock ------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'semesters', 'courses', 'timetable_slots', 'extra_classes', 'marks', 'notification_settings', 'institute_calendar'] loop
    execute format('create trigger touch_updated_at before insert or update on v2.%I for each row execute function v2.touch_updated_at()', t);
  end loop;
end;
$$;

-- Indexes for incremental sync and foreign keys -------------------------------

create index on v2.semesters (user_id, updated_at);
create index on v2.courses (user_id, updated_at);
create index on v2.courses (semester_id);
create index on v2.timetable_slots (user_id, updated_at);
create index on v2.timetable_slots (course_id);
create index on v2.extra_classes (user_id, updated_at);
create index on v2.extra_classes (course_id);
create index on v2.marks (user_id, updated_at);
create index on v2.marks (course_id);
create index on v2.institute_calendar (updated_at);

-- Row level security: every student sees and writes only their own rows -------

alter table v2.profiles enable row level security;
alter table v2.semesters enable row level security;
alter table v2.courses enable row level security;
alter table v2.timetable_slots enable row level security;
alter table v2.extra_classes enable row level security;
alter table v2.marks enable row level security;
alter table v2.notification_settings enable row level security;
alter table v2.institute_calendar enable row level security;

create policy "own profile" on v2.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own semesters" on v2.semesters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own courses" on v2.courses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from v2.semesters s where s.id = semester_id and s.user_id = (select auth.uid()))
  );

create policy "own slots" on v2.timetable_slots for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from v2.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

create policy "own extra classes" on v2.extra_classes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from v2.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

create policy "own marks" on v2.marks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from v2.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

create policy "own notification settings" on v2.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "calendar is public" on v2.institute_calendar for select to anon, authenticated
  using (true);

grant select, insert, update, delete on
  v2.profiles, v2.semesters, v2.courses, v2.timetable_slots, v2.extra_classes, v2.marks, v2.notification_settings
  to authenticated;
grant select on v2.institute_calendar to anon, authenticated;
grant all on all tables in schema v2 to service_role;

-- Seed the institute calendar from the old app's table (0 = Monday there, ISO 1 = Monday here).

insert into v2.institute_calendar (date, day_type, description, follows_day_of_week, audience)
select date, day_type, description,
       case when follows_day_of_week is null then null else follows_day_of_week + 1 end,
       audience
from public.institute_calendar
on conflict (date, audience, day_type) do nothing;

-- Expose the schema through the REST API.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, v2';
notify pgrst, 'reload config';
