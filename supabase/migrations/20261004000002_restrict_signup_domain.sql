-- Only KMUTNB accounts (@email.kmutnb.ac.th) may create a POSA account.
-- Used as Supabase's "Before User Created" auth hook: it runs on the server
-- before auth.users gets a new row, so the app can't bypass it. The Google
-- `hd` hint in the app only filters the account picker; this is the real check.
-- Does nothing until it's enabled in Dashboard -> Authentication -> Hooks.
-- Accounts that already exist are not affected (the hook only runs on signup).
create or replace function public.hook_restrict_signup_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email_domain text := lower(split_part(event -> 'user' ->> 'email', '@', 2));
begin
  if email_domain = 'email.kmutnb.ac.th' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'POSA is limited to @email.kmutnb.ac.th accounts.'
  ));
end;
$$;

-- Only the Auth server may call the hook.
grant execute on function public.hook_restrict_signup_domain(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_domain(jsonb) from authenticated, anon, public;
