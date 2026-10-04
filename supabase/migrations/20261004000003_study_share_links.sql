-- study_share_links: a clinician shares ONE study with a patient through a QR
-- code or link. Patients have no accounts; the random token in the link is the
-- only credential, so it is long (64 hex chars), expires, and can be revoked.
create table study_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  ecg_upload_id uuid not null references ecg_uploads (id) on delete cascade,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz
);

create index study_share_links_ecg_upload_id_idx on study_share_links (ecg_upload_id);

alter table study_share_links enable row level security;

create policy "select own share links" on study_share_links
  for select using (auth.uid() = created_by);

-- The exists() subquery runs under the caller's own ecg_uploads RLS, so a
-- clinician can only share a study they are allowed to see.
create policy "insert share links for visible studies" on study_share_links
  for insert with check (
    auth.uid() = created_by
    and exists (select 1 from ecg_uploads u where u.id = ecg_upload_id)
  );

-- Revoke by setting revoked_at; there is no delete policy.
create policy "update own share links" on study_share_links
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

grant select, insert, update on public.study_share_links to authenticated;

-- What a patient sees for a valid token: no patient identity (no sex, age, BMI
-- or subject code), only the study itself. security definer lets anonymous
-- patients read this one row without any table access of their own.
create function public.get_shared_study(p_token text)
returns table (
  record_code text,
  created_at timestamptz,
  status text,
  sampling_rate_hz integer,
  lead_configuration text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.record_code, u.created_at, u.status, u.sampling_rate_hz, u.lead_configuration, l.expires_at
  from study_share_links l
  join ecg_uploads u on u.id = l.ecg_upload_id
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now()
    and u.deleted_at is null;
$$;

revoke execute on function public.get_shared_study(text) from public;
grant execute on function public.get_shared_study(text) to anon, authenticated;
