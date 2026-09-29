-- ecg_uploads: one row per recording/study (the "records" list on the Home screen, e.g.
-- "REC-8842-PT"). The file itself lives in a Storage bucket, referenced here by storage_path.
-- clinician_id is denormalized from patients.clinician_id so RLS doesn't need a join.
create table ecg_uploads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  clinician_id uuid not null references profiles (id) on delete cascade,
  record_code text,                     -- e.g. "REC-8842-PT"; human-facing display id
  storage_path text not null,
  original_filename text,
  device_brand text,
  lead_configuration text,              -- e.g. "Lead II", "Modified V1" (Upload screen option)
  sampling_rate_hz integer,
  duration_seconds integer,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'standardized', 'processing', 'failed')),
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz                 -- soft delete: preserves the clinical audit trail
);

create index ecg_uploads_patient_id_idx on ecg_uploads (patient_id);
create index ecg_uploads_clinician_id_idx on ecg_uploads (clinician_id);

alter table ecg_uploads enable row level security;

-- split into per-action policies, same reasoning as patients above: SELECT hides
-- soft-deleted rows, no DELETE policy (soft delete only via UPDATE).
create policy "select own active ecg_uploads" on ecg_uploads
  for select using (auth.uid() = clinician_id and deleted_at is null);

create policy "insert own ecg_uploads" on ecg_uploads
  for insert with check (auth.uid() = clinician_id);

create policy "update own ecg_uploads" on ecg_uploads
  for update using (auth.uid() = clinician_id) with check (auth.uid() = clinician_id);
