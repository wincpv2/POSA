-- The signup trigger (handle_new_user) only fires when an auth user is first
-- created. If a profile row is ever deleted, logging in again would leave the
-- clinician without a profile, and every clinician_patients / ecg_uploads insert
-- would fail its foreign key. Let a signed-in user re-create their OWN profile;
-- the app does this on every login (insert ... on conflict do nothing).
grant insert on public.profiles to authenticated;

create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);
