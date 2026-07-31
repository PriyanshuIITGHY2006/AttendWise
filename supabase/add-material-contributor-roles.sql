-- Folder (course-folder) sharing with an Edit / View-only toggle, plus the
-- member-type file rule. Live migrations: material_contributor_roles,
-- material_file_upload_owner_domain, material_full_is_owner_or_toggled,
-- folder_share_edit_view. This file records the FINAL state.
--
-- Model:
--   * Materials opens to everyone with course access.
--   * A folder share is "view" (read-only) or "edit" (can write).
--   * With edit, WHAT you can write follows member type: links always; files
--     only for a Type-A user (material_access_allowlist) in a Type-A-owned
--     course. Even a Type-A user can only add links in a Type-B-owned course.
--   * Only course folders are shareable (no per-file public links).
--
-- Verified with simulated identities (view recipient, edit recipient Type B,
-- edit recipient Type A in a Type-A course, edit Type A in a Type-B course,
-- owner, stranger).

-- Per-share role: view (read-only) or edit (write). New shares default to view.
alter table public.course_shares
  add column if not exists role text not null default 'view';
alter table public.course_shares drop constraint if exists course_shares_role_check;
alter table public.course_shares add constraint course_shares_role_check check (role in ('edit', 'view'));

-- Write (edit) permission for a folder: own the course or hold an 'edit' share.
create or replace function private.is_full_material_user(cid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from courses c where c.id = cid and c.user_id = auth.uid())
      or exists (
        select 1 from course_shares s
        where s.course_id = cid
          and lower(s.shared_with_email) = lower(coalesce(auth.email(), ''))
          and s.role = 'edit'
      );
$$;

-- Is the given course owned by a Type-A (allow-listed) user?
create or replace function private.course_owner_is_full(cid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from courses c
    join auth.users u on u.id = c.user_id
    join material_access_allowlist a on lower(a.email) = lower(u.email)
    where c.id = cid
  );
$$;

-- Read: anyone who can access the course (owner or any share, view or edit).
drop policy if exists "read accessible materials" on public.materials;
create policy "read accessible materials" on public.materials
  for select using (private.can_access_course(course_id));

-- Insert: needs write (edit) permission for everything, including links; a file
-- additionally needs a Type-A user in a Type-A-owned course.
drop policy if exists "insert into accessible courses" on public.materials;
create policy "insert into accessible courses" on public.materials
  for insert with check (
    auth.uid() = user_id
    and private.can_access_course(course_id)
    and private.is_full_material_user(course_id)
    and (
      (file_path is not null
        and private.has_material_access(auth.email())
        and private.course_owner_is_full(course_id))
      or (file_path is null and external_link is not null)
    )
  );

-- Update / delete: editors (or the row owner); a file_path may only be present
-- if the editor is upload-eligible.
drop policy if exists "update accessible materials" on public.materials;
create policy "update accessible materials" on public.materials
  for update using (
    private.can_access_course(course_id)
    and (private.is_full_material_user(course_id) or user_id = auth.uid())
  )
  with check (
    private.can_access_course(course_id)
    and (private.is_full_material_user(course_id) or user_id = auth.uid())
    and (
      file_path is null
      or (private.has_material_access(auth.email()) and private.course_owner_is_full(course_id))
    )
  );

drop policy if exists "delete accessible materials" on public.materials;
create policy "delete accessible materials" on public.materials
  for delete using (
    private.can_access_course(course_id)
    and (private.is_full_material_user(course_id) or user_id = auth.uid())
  );

-- Courses where the current user may upload files (client shows the file picker
-- only where uploads will succeed).
create or replace function public.uploadable_course_ids()
returns setof uuid language sql stable security definer set search_path to 'public'
as $$
  select c.id from courses c
  where private.has_material_access(auth.email())
    and private.can_access_course(c.id)
    and private.course_owner_is_full(c.id);
$$;
grant execute on function public.uploadable_course_ids() to authenticated;

-- Per-file public share links were removed; only folders are shareable.
drop table if exists public.material_shares cascade;
