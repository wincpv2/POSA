-- Keep the private inference worker's PostgREST access after schema restores.
grant usage on schema public to service_role;
grant select, update on public.ecg_uploads to service_role;
grant select on public.clinician_patients to service_role;
grant select, insert, update on public.prediction_runs to service_role;
grant select, insert on public.prediction_minutes to service_role;
grant select, insert, update on public.models to service_role;
