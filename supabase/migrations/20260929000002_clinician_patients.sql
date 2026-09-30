-- Splits "patient identity" from "clinician relationship" so more than one
-- clinician can be attached to the same real patient and see continuity of
-- care — approved 2026-09-29 by the user, addressing the "second proposal"
-- (cross-clinician patient history) discussed on posa.md. The cross-clinician
-- *matching* question (how a new clinician finds an existing patient identity
-- instead of creating a duplicate) is deliberately NOT solved here — schema
-- first, matching flow later, per the user's own call.

-- 1. New join table: one row per clinician<->patient relationship.
create table clinician_patients (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references profiles (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete cascade,
  subject_code text not null,          -- this clinician's own label for the patient
  notes text,
  added_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (clinician_id, subject_code),
  unique (clinician_id, patient_id)    -- can't attach to the same patient twice
);

create index clinician_patients_clinician_id_idx on clinician_patients (clinician_id);
create index clinician_patients_patient_id_idx on clinician_patients (patient_id);

alter table clinician_patients enable row level security;

create policy "select own active clinician_patients" on clinician_patients
  for select using (auth.uid() = clinician_id and deleted_at is null);

create policy "insert own clinician_patients" on clinician_patients
  for insert with check (auth.uid() = clinician_id);

create policy "update own clinician_patients" on clinician_patients
  for update using (auth.uid() = clinician_id) with check (auth.uid() = clinician_id);

-- 2. Migrate existing ownership data (subject_code, notes, deleted_at) into the
-- new join table before patients loses those columns.
insert into clinician_patients (clinician_id, patient_id, subject_code, notes, added_at, deleted_at)
select clinician_id, id, subject_code, notes, created_at, deleted_at
from patients;

-- 3. Drop patients' old ownership-based policies (must happen before the
-- columns they reference are dropped).
drop policy "select own active patients" on patients;
drop policy "insert own patients" on patients;
drop policy "update own patients" on patients;

-- 4. Strip ownership columns off patients — cascade removes the old unique
-- constraint and index that depended on clinician_id/subject_code.
alter table patients drop column clinician_id cascade;
alter table patients drop column subject_code cascade;
alter table patients drop column notes;
alter table patients drop column deleted_at;

-- 5. New patients policies: visibility/edit rights now go through an active
-- clinician_patients relationship instead of direct ownership.
create policy "select attached patients" on patients
  for select using (
    exists (
      select 1 from clinician_patients cp
      where cp.patient_id = patients.id
        and cp.clinician_id = auth.uid()
        and cp.deleted_at is null
    )
  );

-- any authenticated clinician may create a brand-new shared patient identity;
-- they attach to it immediately afterward via their own clinician_patients insert.
create policy "insert new patient identity" on patients
  for insert to authenticated with check (true);

create policy "update attached patients" on patients
  for update using (
    exists (
      select 1 from clinician_patients cp
      where cp.patient_id = patients.id
        and cp.clinician_id = auth.uid()
        and cp.deleted_at is null
    )
  );

-- 6. ecg_uploads: the actual "continuity of care" payoff — any clinician
-- currently attached to the patient can see all of that patient's studies,
-- not just the ones they personally uploaded. Insert/update stay restricted
-- to the uploader (auth.uid() = clinician_id), unchanged.
drop policy "select own active ecg_uploads" on ecg_uploads;

create policy "select ecg_uploads for attached patients" on ecg_uploads
  for select using (
    deleted_at is null
    and exists (
      select 1 from clinician_patients cp
      where cp.patient_id = ecg_uploads.patient_id
        and cp.clinician_id = auth.uid()
        and cp.deleted_at is null
    )
  );

-- 7. Grants: authenticated needs the new table (same "Automatically expose new
-- tables" was off, so this table needs the same manual grant as the others).
grant select, insert, update on public.clinician_patients to authenticated;
