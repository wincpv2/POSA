-- PostgREST returns inserted rows by default, so the inference worker needs
-- SELECT as well as INSERT when persisting per-minute model outputs.
grant select, insert on public.prediction_minutes to service_role;
