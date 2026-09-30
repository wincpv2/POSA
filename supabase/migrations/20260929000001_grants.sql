-- Table-level GRANTs for the authenticated role.
--
-- These are required because the Supabase project was created with "Automatically
-- expose new tables" turned OFF (deliberate — see posa.md Security section): new
-- tables get RLS enabled but no privileges granted to anon/authenticated by default,
-- so even a matching RLS policy can't be reached without an explicit GRANT first.
--
-- audit_log intentionally gets no grants at all here: it must stay reachable only
-- via the service_role key, which bypasses RLS and grants entirely.

grant select, update on public.profiles to authenticated;
-- no insert: rows are created only by the handle_new_user() trigger (security definer)

grant select, insert, update on public.patients to authenticated;
grant select, insert, update on public.ecg_uploads to authenticated;
-- no delete on either: soft delete only, via update (deleted_at)

grant select on public.models to authenticated;
-- writes to models are service_role-only, per its existing RLS policy
