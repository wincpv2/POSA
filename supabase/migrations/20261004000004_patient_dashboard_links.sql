-- patient_share_links: a clinician gives a patient ONE link/QR code to their own
-- dashboard, which lists every night recorded for that patient (including
-- nights uploaded later, and by other clinicians attached to the same
-- patient). Patients have no accounts; the random token is the credential.
create table patient_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  patient_id uuid not null references patients (id) on delete cascade,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz
);

create index patient_share_links_patient_id_idx on patient_share_links (patient_id);

alter table patient_share_links enable row level security;

create policy "select own patient links" on patient_share_links
  for select using (auth.uid() = created_by);

-- Only for a patient this clinician is actively attached to.
create policy "insert links for attached patients" on patient_share_links
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from clinician_patients cp
      where cp.patient_id = patient_share_links.patient_id
        and cp.clinician_id = auth.uid()
        and cp.deleted_at is null
    )
  );

-- Revoke by setting revoked_at; there is no delete policy.
create policy "update own patient links" on patient_share_links
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

grant select, insert, update on public.patient_share_links to authenticated;

-- What the patient dashboard reads for a valid token. Returns jsonb so new
-- parameters (once the analysis model is connected) can be added without
-- changing the function's signature. No patient identity is returned.
create function public.get_patient_dashboard(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'expires_at', l.expires_at,
    'studies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_code', u.record_code,
        'created_at', u.created_at,
        'status', u.status,
        'sampling_rate_hz', u.sampling_rate_hz,
        'lead_configuration', u.lead_configuration
      ) order by u.created_at desc)
      from ecg_uploads u
      where u.patient_id = l.patient_id and u.deleted_at is null
    ), '[]'::jsonb)
  )
  from patient_share_links l
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now();
$$;

revoke execute on function public.get_patient_dashboard(text) from public;
grant execute on function public.get_patient_dashboard(text) to anon, authenticated;
