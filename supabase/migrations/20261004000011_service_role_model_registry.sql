-- Let the inference service register/activate its model row. The service role
-- still bypasses RLS; no client-facing role receives write access.
grant select, insert, update on public.models to service_role;
