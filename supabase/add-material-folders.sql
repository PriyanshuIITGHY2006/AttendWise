-- Custom folders inside a course's Materials (applied via migration
-- `add_material_folders`). A new table plus a nullable materials.folder_id
-- column -- the materials RLS is NOT touched, so shared-course access is
-- unchanged. Verified as the authenticated role: the course owner can
-- create/read folders, a stranger's insert is blocked by RLS.
create table if not exists public.material_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.material_folders enable row level security;

create policy "read course folders" on public.material_folders
  for select using (user_id = auth.uid() or private.can_access_course(course_id));
create policy "insert own course folders" on public.material_folders
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  );
create policy "update own course folders" on public.material_folders
  for update using (user_id = auth.uid());
create policy "delete own course folders" on public.material_folders
  for delete using (user_id = auth.uid());

create unique index if not exists material_folders_uniq
  on public.material_folders (course_id, lower(name));

alter table public.materials
  add column if not exists folder_id uuid references public.material_folders(id) on delete set null;
