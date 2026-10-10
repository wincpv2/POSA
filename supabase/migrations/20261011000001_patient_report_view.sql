drop function if exists public.get_shared_study(text);
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
  approved_at timestamptz,
  subject_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.record_code, u.created_at, u.status, u.sampling_rate_hz,
    u.lead_configuration, l.expires_at,
    case when r.status = 'approved' then p.apnea_minutes end,
    case when r.status = 'approved' then p.total_minutes end,
    case when r.status = 'approved' then p.apnea_percent end,
    case when r.status = 'approved' then r.patient_explanation end,
    case when r.status = 'approved' then r.approved_at end,
    cp.subject_code
  from public.study_share_links l
  join public.ecg_uploads u on u.id = l.ecg_upload_id
  left join public.clinician_patients cp
    on cp.patient_id = u.patient_id and cp.clinician_id = l.created_by and cp.deleted_at is null
  left join public.study_reports r on r.ecg_upload_id = u.id
  left join lateral (
    select pr.apnea_minutes, pr.total_minutes, pr.apnea_percent
    from public.prediction_runs pr
    where pr.ecg_upload_id = u.id and pr.status = 'completed'
    order by pr.created_at desc limit 1
  ) p on true
  where l.token = p_token and l.revoked_at is null
    and l.expires_at > now() and u.deleted_at is null;
$$;
revoke execute on function public.get_shared_study(text) from public;
grant execute on function public.get_shared_study(text) to anon, authenticated;

create or replace function public.get_patient_dashboard(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'expires_at', l.expires_at,
    'subject_code', (
      select cp.subject_code
      from public.clinician_patients cp
      where cp.patient_id = l.patient_id and cp.clinician_id = l.created_by and cp.deleted_at is null
      limit 1
    ),
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
  where l.token = p_token and l.revoked_at is null and l.expires_at > now();
$$;
revoke execute on function public.get_patient_dashboard(text) from public;
grant execute on function public.get_patient_dashboard(text) to anon, authenticated;

create or replace function public.get_patient_report_pdf(p_token text, p_kind text)
returns table (storage_path text, record_code text)
language sql
stable
security definer
set search_path = public
as $$
  with shared_studies as (
    select u.id, u.record_code
    from public.patient_share_links l
    join public.ecg_uploads u on u.patient_id = l.patient_id
    where p_kind = 'dashboard' and l.token = p_token
      and l.revoked_at is null and l.expires_at > now()
      and u.deleted_at is null
    union all
    select u.id, u.record_code
    from public.study_share_links l
    join public.ecg_uploads u on u.id = l.ecg_upload_id
    where p_kind = 'study' and l.token = p_token
      and l.revoked_at is null and l.expires_at > now()
      and u.deleted_at is null
  )
  select rp.storage_path, coalesce(s.record_code, 'POSA-report')
  from shared_studies s
  join public.report_pdfs rp on rp.ecg_upload_id = s.id
  join public.study_reports r on r.ecg_upload_id = s.id
    and r.status = 'approved' and r.approved_at = rp.approved_at
  order by rp.approved_at desc, rp.created_at desc
  limit 1;
$$;
revoke all on function public.get_patient_report_pdf(text, text) from public, anon, authenticated;
grant execute on function public.get_patient_report_pdf(text, text) to service_role;
