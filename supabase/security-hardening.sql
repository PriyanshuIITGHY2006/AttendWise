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

-- 2) am_i_material_allowed MUST stay SECURITY DEFINER.
--    It was briefly switched to SECURITY INVOKER to silence the definer-exposure
--    warning, but that broke Materials access: the client calls it as the
--    `authenticated` role, which has no USAGE on the `private` schema, so the
--    inner private.has_material_access call failed and the check returned null
--    (Materials tab disappeared). Reverted below. The warning is a false
--    positive here -- it only ever returns the caller's own boolean status.
create or replace function public.am_i_material_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select private.has_material_access(auth.email());
$$;

-- NOTE (accepted): pg_net grants USAGE/EXECUTE on schema `net` to anon +
-- authenticated by default (granted by supabase_admin, not revocable as
-- postgres). This is NOT reachable via the REST API (PostgREST only exposes
-- `public`), so there is no exploit path; left as the Supabase-managed default.
--
-- NOTE (dashboard): enable Auth -> "Leaked password protection" (HaveIBeenPwned)
-- in the Supabase dashboard; it can't be toggled from SQL.
