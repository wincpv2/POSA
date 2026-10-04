-- study_reports: the clinician-written part of a study's report.
--   clinician_opinion   - the clinician's interpretation (Clinician report tab)
--   patient_explanation - plain-language text the clinician writes for the patient
--   status              - draft -> reviewed -> approved (and back)
-- Sign-off (who reviewed / approved, and when) is stamped by a trigger from the
-- signed-in account, so the app cannot fake it. Approved reports are locked.
create table study_reports (
  ecg_upload_id uuid primary key references ecg_uploads (id) on delete cascade,
  clinician_opinion text not null default '',
  patient_explanation text not null default '',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved')),
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  approved_by uuid references profiles (id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table study_reports enable row level security;

-- Any clinician who can see the study (ecg_uploads' own RLS, through the
-- exists() subquery) can read and work on its report.
create policy "select reports for visible studies" on study_reports
  for select using (exists (select 1 from ecg_uploads u where u.id = ecg_upload_id));
create policy "insert reports for visible studies" on study_reports
  for insert with check (exists (select 1 from ecg_uploads u where u.id = ecg_upload_id));
create policy "update reports for visible studies" on study_reports
  for update using (exists (select 1 from ecg_uploads u where u.id = ecg_upload_id))
  with check (exists (select 1 from ecg_uploads u where u.id = ecg_upload_id));

grant select, insert, update on public.study_reports to authenticated;

create function public.study_reports_sign_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce((select display_name from profiles where id = auth.uid()), 'Clinician');
  v_old text := case when tg_op = 'UPDATE' then old.status else null end;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
  end if;

  if v_old = 'approved' and new.status = 'approved'
     and (new.clinician_opinion is distinct from old.clinician_opinion
          or new.patient_explanation is distinct from old.patient_explanation) then
    raise exception 'This report is approved and locked. Move it back to Reviewed to edit it.';
  end if;

  -- sign-off columns always come from here, never from the client
  if tg_op = 'UPDATE' then
    new.reviewed_by := old.reviewed_by; new.reviewed_by_name := old.reviewed_by_name; new.reviewed_at := old.reviewed_at;
    new.approved_by := old.approved_by; new.approved_by_name := old.approved_by_name; new.approved_at := old.approved_at;
  else
    new.reviewed_by := null; new.reviewed_by_name := null; new.reviewed_at := null;
    new.approved_by := null; new.approved_by_name := null; new.approved_at := null;
  end if;

  if new.status = 'draft' then
    new.reviewed_by := null; new.reviewed_by_name := null; new.reviewed_at := null;
    new.approved_by := null; new.approved_by_name := null; new.approved_at := null;
  elsif new.status = 'reviewed' then
    if v_old = 'draft' then
      new.reviewed_by := auth.uid(); new.reviewed_by_name := v_name; new.reviewed_at := now();
    end if;
    new.approved_by := null; new.approved_by_name := null; new.approved_at := null;
  elsif new.status = 'approved' and v_old is distinct from 'approved' then
    if v_old is distinct from 'reviewed' then
      raise exception 'Mark the report reviewed before approving it.';
    end if;
    if btrim(new.clinician_opinion) = '' or btrim(new.patient_explanation) = '' then
      raise exception 'Write the clinician opinion and the patient explanation before approving.';
    end if;
    new.approved_by := auth.uid(); new.approved_by_name := v_name; new.approved_at := now();
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger study_reports_sign_off
  before insert or update on study_reports
  for each row execute function public.study_reports_sign_off();

-- The patient dashboard now also returns, per night, the patient explanation
-- once that night's report is approved (never the clinician opinion).
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
        'patient_explanation', case when r.status = 'approved' then r.patient_explanation end,
        'approved_at', case when r.status = 'approved' then r.approved_at end
      ) order by u.created_at desc)
      from ecg_uploads u
      left join study_reports r on r.ecg_upload_id = u.id
      where u.patient_id = l.patient_id and u.deleted_at is null
    ), '[]'::jsonb)
  )
  from patient_share_links l
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now();
$$;
