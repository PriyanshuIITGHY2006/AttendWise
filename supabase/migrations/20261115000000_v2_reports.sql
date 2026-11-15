-- In-app reports: people send a problem or an idea, with optional screenshots, and only the developer reads them.

-- Who can read every report. Add a row by hand: insert into v2.admins (user_id) values ('<user id>');
create table if not exists v2.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table v2.admins enable row level security;

create or replace function v2.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from v2.admins where user_id = auth.uid()) $$;
revoke all on function v2.is_admin() from public;
grant execute on function v2.is_admin() to authenticated;

create table if not exists v2.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  area text check (area is null or area in ('today', 'courses', 'plan', 'calendar', 'profile', 'sign_in', 'widgets', 'notifications', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  platform text not null check (platform in ('android', 'web')),
  app_version text check (char_length(app_version) <= 40),
  device jsonb check (device is null or pg_column_size(device) <= 4000),
  reporter_name text check (char_length(reporter_name) <= 120),
  reporter_email text check (char_length(reporter_email) <= 254),
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'fixed', 'wont_fix')),
  admin_note text check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_created_idx on v2.reports (created_at desc);
create index if not exists reports_user_idx on v2.reports (user_id, created_at desc);
alter table v2.reports enable row level security;

drop policy if exists reports_insert_own on v2.reports;
create policy reports_insert_own on v2.reports for insert to authenticated
  with check (user_id = auth.uid() and status = 'new' and admin_note is null);
drop policy if exists reports_select on v2.reports;
create policy reports_select on v2.reports for select to authenticated
  using (user_id = auth.uid() or v2.is_admin());
drop policy if exists reports_update_admin on v2.reports;
create policy reports_update_admin on v2.reports for update to authenticated
  using (v2.is_admin()) with check (v2.is_admin());

-- At most ten reports a day from one person.
create or replace function v2.reports_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from v2.reports where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many reports today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists reports_limit on v2.reports;
create trigger reports_limit before insert on v2.reports for each row execute function v2.reports_limit();

create or replace function v2.touch_report() returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists reports_touch on v2.reports;
create trigger reports_touch before update on v2.reports for each row execute function v2.touch_report();

create table if not exists v2.report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references v2.reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  name text check (char_length(name) <= 120),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);
create index if not exists report_files_report_idx on v2.report_files (report_id);
alter table v2.report_files enable row level security;

drop policy if exists report_files_insert_own on v2.report_files;
create policy report_files_insert_own on v2.report_files for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from v2.reports r where r.id = report_id and r.user_id = auth.uid()));
drop policy if exists report_files_select on v2.report_files;
create policy report_files_select on v2.report_files for select to authenticated
  using (user_id = auth.uid() or v2.is_admin());

-- At most five screenshots on one report.
create or replace function v2.report_files_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from v2.report_files where report_id = new.report_id) >= 5 then
    raise exception 'A report can have at most 5 screenshots.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists report_files_limit on v2.report_files;
create trigger report_files_limit before insert on v2.report_files for each row execute function v2.report_files_limit();

grant select, insert, update on v2.reports to authenticated;
grant select, insert on v2.report_files to authenticated;

-- A private bucket for the screenshots: images only, 5 MB each. Each person writes into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-files', 'report-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists report_files_upload on storage.objects;
create policy report_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'report-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists report_files_read on storage.objects;
create policy report_files_read on storage.objects for select to authenticated
  using (bucket_id = 'report-files' and ((storage.foldername(name))[1] = auth.uid()::text or v2.is_admin()));
