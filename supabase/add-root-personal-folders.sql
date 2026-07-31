-- Top-level (root) personal folders (live migration: root_personal_folders).
-- Course-less folders and course-less materials, PRIVATE to their owner, with no
-- category templates inside. A personal file still requires a Type-A (file-
-- enabled) user; personal links are open to any owner.
--
-- Verified with simulated identities: the owner can create and read a personal
-- folder + material; a different user cannot read it.

alter table public.material_folders alter column course_id drop not null;
alter table public.materials alter column course_id drop not null;

-- Folders: allow a personal root folder (no course) owned by the user.
drop policy "insert own course folders" on public.material_folders;
create policy "insert own folders" on public.material_folders
  for insert with check (
    user_id = auth.uid()
    and (course_id is null or exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()))
  );

create unique index if not exists material_folders_root_uniq
  on public.material_folders (user_id, lower(name)) where course_id is null;

-- Materials: a course-less row is fully managed by its owner only. Course rows
-- keep the tiered folder-share rules.
drop policy "read accessible materials" on public.materials;
create policy "read accessible materials" on public.materials
  for select using (
    private.can_access_course(course_id)
    or (course_id is null and user_id = auth.uid())
  );

drop policy "insert into accessible courses" on public.materials;
create policy "insert into accessible courses" on public.materials
  for insert with check (
    auth.uid() = user_id
    and (
      (course_id is not null
        and private.can_access_course(course_id)
        and private.is_full_material_user(course_id)
        and (
          (file_path is not null and private.has_material_access(auth.email()) and private.course_owner_is_full(course_id))
          or (file_path is null and external_link is not null)
        ))
      or
      (course_id is null
        and (
          (file_path is not null and private.has_material_access(auth.email()))
          or (file_path is null and external_link is not null)
        ))
    )
  );

drop policy "update accessible materials" on public.materials;
create policy "update accessible materials" on public.materials
  for update using (
    (private.can_access_course(course_id) and (private.is_full_material_user(course_id) or user_id = auth.uid()))
    or (course_id is null and user_id = auth.uid())
  )
  with check (
    (private.can_access_course(course_id)
      and (private.is_full_material_user(course_id) or user_id = auth.uid())
      and (file_path is null or (private.has_material_access(auth.email()) and private.course_owner_is_full(course_id))))
    or
    (course_id is null and user_id = auth.uid()
      and (file_path is null or private.has_material_access(auth.email())))
  );

drop policy "delete accessible materials" on public.materials;
create policy "delete accessible materials" on public.materials
  for delete using (
    (private.can_access_course(course_id) and (private.is_full_material_user(course_id) or user_id = auth.uid()))
    or (course_id is null and user_id = auth.uid())
  );
