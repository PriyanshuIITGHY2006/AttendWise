-- Security hardening pass (applied to the live project via migrations
-- `harden_security_definer_functions` and `lock_down_pg_net*`).
--
-- 1) can_access_course was SECURITY DEFINER and exposed as a public RPC
--    (/rest/v1/rpc/can_access_course) callable by anon + authenticated. It is
--    only meant to be used inside RLS policies, so it was moved out of the
--    API-exposed public schema into `private` and external EXECUTE revoked.
--    (Policies reference it by OID, so they keep working -- re-verified with
--    simulated owner/recipient/stranger users.)
alter function public.can_access_course(uuid) set schema private;      -- -> private.can_access_course
revoke all on function private.can_access_course(uuid) from anon, public;
grant execute on function private.can_access_course(uuid) to authenticated;

-- 2) am_i_material_allowed only returns the caller's own allow-status, so it
--    doesn't need SECURITY DEFINER (removes the definer-exposure warning).
create or replace function public.am_i_material_allowed()
returns boolean language sql stable security invoker set search_path = public as $$
  select private.has_material_access(auth.email());
$$;
grant execute on function private.has_material_access(text) to authenticated;

-- NOTE (accepted): pg_net grants USAGE/EXECUTE on schema `net` to anon +
-- authenticated by default (granted by supabase_admin, not revocable as
-- postgres). This is NOT reachable via the REST API (PostgREST only exposes
-- `public`), so there is no exploit path; left as the Supabase-managed default.
--
-- NOTE (dashboard): enable Auth -> "Leaked password protection" (HaveIBeenPwned)
-- in the Supabase dashboard; it can't be toggled from SQL.
