-- Existing policies and RPCs reference this helper by its historical name.
create or replace function public.is_google_clinician()
returns boolean
language sql stable
as $$
  select auth.uid() is not null and coalesce(
    auth.jwt() -> 'app_metadata' ->> 'provider' = 'email'
    or auth.jwt() -> 'app_metadata' -> 'providers' @> '["email"]'::jsonb,
    false
  );
$$;
