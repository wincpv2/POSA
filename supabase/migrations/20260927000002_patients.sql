-- patients: a clinician's patient roster. Patients don't log in themselves — they're
-- records owned and managed by the clinician account (profiles.id) that created them.
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references profiles (id) on delete cascade,
  subject_code text not null,           -- e.g. "PT-2024-X07", shown in the Upload screen
  sex text check (sex in ('male', 'female', 'other', 'unspecified')),
  date_of_birth date,
  bmi numeric,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                -- soft delete: preserves the clinical audit trail
  unique (clinician_id, subject_code)
);

create index patients_clinician_id_idx on patients (clinician_id);

alter table patients enable row level security;

-- split into per-action policies (rather than one "for all") so SELECT can hide
-- soft-deleted rows while INSERT/UPDATE stay unaffected. No DELETE policy: clinical
-- records are soft-deleted only (set deleted_at via UPDATE), never hard-deleted by clients.
create policy "select own active patients" on patients
  for select using (auth.uid() = clinician_id and deleted_at is null);

create policy "insert own patients" on patients
  for insert with check (auth.uid() = clinician_id);

create policy "update own patients" on patients
  for update using (auth.uid() = clinician_id) with check (auth.uid() = clinician_id);
