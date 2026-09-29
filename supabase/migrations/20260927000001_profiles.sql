-- profiles: 1:1 extension of auth.users, doesn't depend on ML output
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- login (OAuth) proves identity only; this records the clinician's separate,
  -- explicit consent to store and process patients' health data.
  consent_accepted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "select own profile" on profiles
  for select using (auth.uid() = id);

create policy "update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
