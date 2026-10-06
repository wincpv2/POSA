-- Least-privilege table grants required by the server-side inference worker.
-- RLS remains enabled; service_role bypasses RLS only on the private backend.
grant select, update on public.ecg_uploads to service_role;
grant select on public.clinician_patients to service_role;
