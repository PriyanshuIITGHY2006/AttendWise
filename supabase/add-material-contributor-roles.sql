-- Tiered materials access (live migrations: material_contributor_roles,
-- material_file_upload_owner_domain, material_full_is_owner_or_toggled). This
-- file records the FINAL state.
--
-- Model:
--   * Materials opens to everyone with course access (view + add links).
--   * FILE UPLOAD is limited to a Type-A user (material_access_allowlist) in a
--     course OWNED BY a Type-A user. Even a Type-A user can only add links in a
--     Type-B-owned course.
--   * Managing OTHERS' materials (edit/move/delete) needs course ownership or a
--     'full' share; you can always manage your own entry. Type-A status governs
--     file upload only, not edit rights in courses you don't own.
--   * The 'full'/'link' per-share toggle sets a recipient's manage reach.
--
-- Verified with simulated identities (owner, another Type-A, link recipient,
-- full recipient, Type-A in a Type-B course, stranger).

-- Per-course contributor level for a shared recipient. New shares default to
-- 'link'; owners elevate trusted people to 'full'.
alter table public.course_shares
  add column if not exists role text not null default 'link'
  check (role in ('full', 'link'));

-- Manage-others rights: course owner or a 'full' share on the course.
create or replace function private.is_full_material_user(cid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from courses c where c.id = cid and c.user_id = auth.uid())
      or exists (
        select 1 from course_shares s
        where s.course_id = cid
          and lower(s.shared_with_email) = lower(coalesce(auth.email(), ''))
          and s.role = 'full'
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

-- Read: anyone who can access the course.
drop policy if exists "read accessible materials" on public.materials;
create policy "read accessible materials" on public.materials
  for select using (private.can_access_course(course_id));

-- Insert: a file needs an upload-eligible user (Type A) in a Type-A-owned
-- course; otherwise only a pure external link.
drop policy if exists "insert into accessible courses" on public.materials;
create policy "insert into accessible courses" on public.materials
  for insert with check (
    auth.uid() = user_id
    and private.can_access_course(course_id)
    and (
      (file_path is not null
        and private.has_material_access(auth.email())
        and private.course_owner_is_full(course_id))
      or (file_path is null and external_link is not null)
    )
  );

-- Update: full contributors or the row owner; a file_path may only be present
-- if the editor is upload-eligible (edit can't smuggle in a file).
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

-- Delete: full contributors or the row owner.
drop policy if exists "delete accessible materials" on public.materials;
create policy "delete accessible materials" on public.materials
  for delete using (
    private.can_access_course(course_id)
    and (private.is_full_material_user(course_id) or user_id = auth.uid())
  );

-- Public share links: only the file's uploader or a Type-A user.
drop policy if exists "insert shares for accessible material" on public.material_shares;
create policy "insert shares for accessible material" on public.material_shares
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.materials m
      where m.id = material_id
        and (m.user_id = auth.uid() or private.has_material_access(auth.email()))
    )
  );

-- Courses where the current user may upload files (client uses this to show the
-- file picker only where uploads will succeed).
create or replace function public.uploadable_course_ids()
returns setof uuid language sql stable security definer set search_path to 'public'
as $$
  select c.id from courses c
  where private.has_material_access(auth.email())
    and private.can_access_course(c.id)
    and private.course_owner_is_full(c.id);
$$;
grant execute on function public.uploadable_course_ids() to authenticated;
