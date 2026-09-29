-- audit_log: provenance trail (who did what, on which row). Write/read only via the
-- service_role key (which bypasses RLS) — no client-facing policies needed.
create table audit_log (
  id bigint generated always as identity primary key,
  clinician_id uuid references profiles (id) on delete set null,
  patient_id uuid references patients (id) on delete set null,
  action text not null,
  entity_table text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;
-- intentionally no policies: only service_role (bypasses RLS) can read/write this table.
