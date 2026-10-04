-- Model runs and minute-level outputs from the local Python inference service.
alter table public.ecg_uploads drop constraint if exists ecg_uploads_status_check;
alter table public.ecg_uploads add constraint ecg_uploads_status_check
  check (status in ('uploaded', 'standardized', 'processing', 'completed', 'failed'));

create table public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  ecg_upload_id uuid not null references public.ecg_uploads (id) on delete cascade,
  model_id uuid not null references public.models (id),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  total_minutes integer,
  apnea_minutes integer,
  apnea_percent numeric(6, 3),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index prediction_runs_upload_created_idx
  on public.prediction_runs (ecg_upload_id, created_at desc);
create unique index prediction_runs_one_active_per_upload_idx
  on public.prediction_runs (ecg_upload_id)
  where status in ('queued', 'processing');

create table public.prediction_minutes (
  run_id uuid not null references public.prediction_runs (id) on delete cascade,
  minute_index integer not null check (minute_index >= 0),
  apnea_probability real not null check (apnea_probability between 0 and 1),
  is_apnea boolean not null,
  primary key (run_id, minute_index)
);

alter table public.prediction_runs enable row level security;
alter table public.prediction_minutes enable row level security;

create policy "read prediction runs for visible studies" on public.prediction_runs
  for select to authenticated
  using (exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id));
create policy "read minute predictions for visible studies" on public.prediction_minutes
  for select to authenticated
  using (exists (
    select 1
    from public.prediction_runs r
    join public.ecg_uploads u on u.id = r.ecg_upload_id
    where r.id = run_id
  ));

grant select on public.prediction_runs, public.prediction_minutes to authenticated;
-- Writes use the server-only service role after the API verifies the caller and study access.

insert into public.models (name, version, model_type, artifact_path, metrics, is_active)
values ('POSA SE-ResNet50-1D', 'epoch-05', 'cnn', 'POSA_MODEL_PATH', null, true)
on conflict (name, version) do update
set is_active = true;

drop function public.get_shared_study(text);
create function public.get_shared_study(p_token text)
returns table (
  record_code text,
  created_at timestamptz,
  status text,
  sampling_rate_hz integer,
  lead_configuration text,
  expires_at timestamptz,
  apnea_minutes integer,
  total_minutes integer,
  apnea_percent numeric,
  patient_explanation text,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.record_code,
    u.created_at,
    u.status,
    u.sampling_rate_hz,
    u.lead_configuration,
    l.expires_at,
    case when r.status = 'approved' then p.apnea_minutes end,
    case when r.status = 'approved' then p.total_minutes end,
    case when r.status = 'approved' then p.apnea_percent end,
    case when r.status = 'approved' then r.patient_explanation end,
    case when r.status = 'approved' then r.approved_at end
  from public.study_share_links l
  join public.ecg_uploads u on u.id = l.ecg_upload_id
  left join public.study_reports r on r.ecg_upload_id = u.id
  left join lateral (
    select pr.apnea_minutes, pr.total_minutes, pr.apnea_percent
    from public.prediction_runs pr
    where pr.ecg_upload_id = u.id and pr.status = 'completed'
    order by pr.created_at desc limit 1
  ) p on true
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now()
    and u.deleted_at is null;
$$;

create or replace function public.get_patient_dashboard(p_token text)
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
        'lead_configuration', u.lead_configuration,
        'apnea_minutes', case when r.status = 'approved' then p.apnea_minutes end,
        'total_minutes', case when r.status = 'approved' then p.total_minutes end,
        'apnea_percent', case when r.status = 'approved' then p.apnea_percent end,
        'patient_explanation', case when r.status = 'approved' then r.patient_explanation end,
        'approved_at', case when r.status = 'approved' then r.approved_at end
      ) order by u.created_at desc)
      from public.ecg_uploads u
      left join public.study_reports r on r.ecg_upload_id = u.id
      left join lateral (
        select pr.apnea_minutes, pr.total_minutes, pr.apnea_percent
        from public.prediction_runs pr
        where pr.ecg_upload_id = u.id and pr.status = 'completed'
        order by pr.created_at desc limit 1
      ) p on true
      where u.patient_id = l.patient_id and u.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.patient_share_links l
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now();
$$;

revoke execute on function public.get_shared_study(text) from public;
grant execute on function public.get_shared_study(text) to anon, authenticated;
revoke execute on function public.get_patient_dashboard(text) from public;
grant execute on function public.get_patient_dashboard(text) to anon, authenticated;
