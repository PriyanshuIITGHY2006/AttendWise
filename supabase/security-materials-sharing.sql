-- Security hardening for the materials sharing / personal-folders work.
-- Live migrations: lock_rpc_to_authenticated, harden_storage_read_prefix_match.
--
-- Findings & fixes (audited with the Supabase security advisor + adversarial RLS
-- simulations):
--
-- 1. SECURITY DEFINER RPCs were callable by the anon role (default PUBLIC grant).
--    They return empty for anon, but locked to authenticated as defense in depth.
--
-- 2. IDOR in the storage read policy (the important one): the "read shared
--    material files" policy matched storage objects by materials.file_path, which
--    the uploader sets freely. A user could insert a material in their own course
--    pointing file_path at ANOTHER user's storage object (including a private
--    personal file) and read it. Fixed by requiring the object's owner-prefix
--    (foldername[1]) to equal the referencing material's uploader (user_id), and
--    excluding personal (course-less) files from shared reads entirely.
--
-- Verified blocked after the fix: recipient self-escalating a share to edit;
-- view-only user inserting; inserting a material as another user_id; moving a
-- personal file into a non-editable course; a Type-B "edit" user uploading a
-- file; and the storage IDOR above. Personal materials and pdf_ink/
-- pdf_annotations remain strictly owner-only (user_id = auth.uid()).

revoke execute on function public.accessible_course_owners() from public, anon;
revoke execute on function public.uploadable_course_ids() from public, anon;
grant execute on function public.accessible_course_owners() to authenticated;
grant execute on function public.uploadable_course_ids() to authenticated;

drop policy "read shared material files" on storage.objects;
create policy "read shared material files" on storage.objects
  for select using (
    bucket_id = 'materials'
    and private.has_material_access(auth.email())
    and exists (
      select 1 from public.materials m
      where m.file_path = name
        and m.course_id is not null
        and (storage.foldername(name))[1] = m.user_id::text
        and private.can_access_course(m.course_id)
    )
  );
