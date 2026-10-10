-- All signed-in Google clinicians may review all records. Writes stay with
-- the clinician who owns the patient or uploaded the study.

create or replace function public.is_google_clinician()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
    or auth.jwt() -> 'app_metadata' ->> 'provider' = 'google';
$$;
revoke all on function public.is_google_clinician() from public, anon;
grant execute on function public.is_google_clinician() to authenticated;

alter table public.patients
  add column owner_clinician_id uuid references public.profiles(id) on delete set null;

update public.patients p
set owner_clinician_id = coalesce(
  (select cp.clinician_id from public.clinician_patients cp where cp.patient_id = p.id order by cp.added_at, cp.id limit 1),
  (select eu.clinician_id from public.ecg_uploads eu where eu.patient_id = p.id order by eu.created_at, eu.id limit 1)
)
where p.owner_clinician_id is null;

create index patients_owner_clinician_id_idx on public.patients(owner_clinician_id);

drop policy "select attached patients" on public.patients;
drop policy "insert new patient identity" on public.patients;
drop policy "update attached patients" on public.patients;

create policy "authenticated clinicians read patients" on public.patients
  for select to authenticated using (public.is_google_clinician());
create policy "clinicians create own patients" on public.patients
  for insert to authenticated with check (public.is_google_clinician() and owner_clinician_id = auth.uid());
create policy "clinicians update own patients" on public.patients
  for update to authenticated using (public.is_google_clinician() and owner_clinician_id = auth.uid())
  with check (public.is_google_clinician() and owner_clinician_id = auth.uid());

drop policy "select own active clinician_patients" on public.clinician_patients;
drop policy "insert own clinician_patients" on public.clinician_patients;
drop policy "update own clinician_patients" on public.clinician_patients;
create policy "google clinicians select own active clinician_patients" on public.clinician_patients
  for select to authenticated using (public.is_google_clinician() and auth.uid() = clinician_id and deleted_at is null);
create policy "google clinicians insert own clinician_patients" on public.clinician_patients
  for insert to authenticated with check (
    public.is_google_clinician() and auth.uid() = clinician_id
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );
create policy "google clinicians update own clinician_patients" on public.clinician_patients
  for update to authenticated using (public.is_google_clinician() and auth.uid() = clinician_id)
  with check (
    public.is_google_clinician() and auth.uid() = clinician_id
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );

drop policy "select ecg_uploads for attached patients" on public.ecg_uploads;
create policy "authenticated clinicians read active studies" on public.ecg_uploads
  for select to authenticated using (public.is_google_clinician() and deleted_at is null);
drop policy "insert own ecg_uploads" on public.ecg_uploads;
drop policy "update own ecg_uploads" on public.ecg_uploads;
create policy "google clinicians insert own ecg_uploads" on public.ecg_uploads
  for insert to authenticated with check (
    public.is_google_clinician() and auth.uid() = clinician_id
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );
create policy "google clinicians update own ecg_uploads" on public.ecg_uploads
  for update to authenticated using (public.is_google_clinician() and auth.uid() = clinician_id)
  with check (
    public.is_google_clinician() and auth.uid() = clinician_id
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );

drop policy "select reports for visible studies" on public.study_reports;
drop policy "insert reports for visible studies" on public.study_reports;
drop policy "update reports for visible studies" on public.study_reports;
create policy "authenticated clinicians read study reports" on public.study_reports
  for select to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id
  ));
create policy "study owners insert reports" on public.study_reports
  for insert to authenticated with check (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid()
  ));
create policy "study owners update reports" on public.study_reports
  for update to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid()
  )) with check (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid()
  ));

drop policy "insert pdfs for approved reports" on public.report_pdfs;
drop policy "select pdfs for visible studies" on public.report_pdfs;
create policy "google clinicians read approved report pdfs" on public.report_pdfs
  for select to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id
  ));
create policy "study owners save approved report pdfs" on public.report_pdfs
  for insert to authenticated with check (
    public.is_google_clinician()
    and auth.uid() = created_by
    and storage_path like auth.uid()::text || '/%'
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid())
    and exists (select 1 from public.study_reports r where r.ecg_upload_id = report_pdfs.ecg_upload_id and r.status = 'approved')
  );

drop policy "insert symptom events for visible studies" on public.ecg_symptom_events;
drop policy "read symptom events for visible studies" on public.ecg_symptom_events;
drop policy "delete own symptom events" on public.ecg_symptom_events;
create policy "google clinicians read symptom events" on public.ecg_symptom_events
  for select to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id
  ));
create policy "study owners add symptom events" on public.ecg_symptom_events
  for insert to authenticated with check (
    public.is_google_clinician()
    and created_by = auth.uid()
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid())
  );
create policy "study owners remove symptom events" on public.ecg_symptom_events
  for delete to authenticated using (
    public.is_google_clinician()
    and created_by = auth.uid()
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid())
  );

drop policy "insert share links for visible studies" on public.study_share_links;
create policy "study owners create share links" on public.study_share_links
  for insert to authenticated with check (
    public.is_google_clinician()
    and auth.uid() = created_by
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid())
  );

drop policy "select own share links" on public.study_share_links;
drop policy "update own share links" on public.study_share_links;
create policy "google clinicians select own share links" on public.study_share_links
  for select to authenticated using (public.is_google_clinician() and auth.uid() = created_by);
create policy "google clinicians update own share links" on public.study_share_links
  for update to authenticated using (public.is_google_clinician() and auth.uid() = created_by)
  with check (
    public.is_google_clinician() and auth.uid() = created_by
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id and u.clinician_id = auth.uid())
  );

drop policy "insert links for attached patients" on public.patient_share_links;
create policy "patient owners create dashboard links" on public.patient_share_links
  for insert to authenticated with check (
    public.is_google_clinician()
    and auth.uid() = created_by
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );

drop policy "select own patient links" on public.patient_share_links;
drop policy "update own patient links" on public.patient_share_links;
create policy "google clinicians select own patient links" on public.patient_share_links
  for select to authenticated using (public.is_google_clinician() and auth.uid() = created_by);
create policy "google clinicians update own patient links" on public.patient_share_links
  for update to authenticated using (public.is_google_clinician() and auth.uid() = created_by)
  with check (
    public.is_google_clinician() and auth.uid() = created_by
    and exists (select 1 from public.patients p where p.id = patient_id and p.owner_clinician_id = auth.uid())
  );

drop policy "clinicians view ecg files for attached patients" on storage.objects;
drop policy "uploaders read ecg annotation sidecars" on storage.objects;
drop policy "uploaders replace ecg annotation sidecars" on storage.objects;
drop policy "clinicians upload ecg files into their own folder" on storage.objects;
create policy "authenticated clinicians read files for active studies" on storage.objects
  for select to authenticated using (
    public.is_google_clinician()
    and
    bucket_id = 'ecg-files'
    and exists (
      select 1 from public.ecg_uploads eu
      where eu.deleted_at is null
        and left(storage.objects.name, length(regexp_replace(eu.storage_path, '[^/]*$', ''))) = regexp_replace(eu.storage_path, '[^/]*$', '')
    )
  );

create policy "google clinicians upload ecg files into their own folder" on storage.objects
  for insert to authenticated with check (
    public.is_google_clinician()
    and bucket_id = 'ecg-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "google clinicians update own annotation sidecars" on storage.objects
  for update to authenticated using (
    public.is_google_clinician()
    and bucket_id = 'ecg-files'
    and exists (
      select 1 from public.ecg_uploads eu
      where eu.clinician_id = auth.uid()
        and lower(storage.objects.name) in (
          lower(regexp_replace(eu.storage_path, '[.]hea$', '.qrs', 'i')),
          lower(regexp_replace(eu.storage_path, '[.]hea$', '.apn', 'i'))
        )
    )
  ) with check (
    public.is_google_clinician()
    and bucket_id = 'ecg-files'
    and exists (
      select 1 from public.ecg_uploads eu
      where eu.clinician_id = auth.uid()
        and lower(storage.objects.name) in (
          lower(regexp_replace(eu.storage_path, '[.]hea$', '.qrs', 'i')),
          lower(regexp_replace(eu.storage_path, '[.]hea$', '.apn', 'i'))
        )
    )
  );

drop policy "clinicians upload report pdfs into their own folder" on storage.objects;
drop policy "clinicians read report pdfs of visible studies" on storage.objects;
create policy "google clinicians upload report pdfs into their own folder" on storage.objects
  for insert to authenticated with check (
    public.is_google_clinician()
    and bucket_id = 'report-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "google clinicians read report pdfs of visible studies" on storage.objects
  for select to authenticated using (
    public.is_google_clinician()
    and bucket_id = 'report-pdfs'
    and exists (select 1 from public.report_pdfs rp where rp.storage_path = storage.objects.name)
  );

drop policy "read prediction runs for visible studies" on public.prediction_runs;
drop policy "read minute predictions for visible studies" on public.prediction_minutes;
create policy "google clinicians read prediction runs" on public.prediction_runs
  for select to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.ecg_uploads u where u.id = ecg_upload_id
  ));
create policy "google clinicians read prediction minutes" on public.prediction_minutes
  for select to authenticated using (public.is_google_clinician() and exists (
    select 1 from public.prediction_runs r
    join public.ecg_uploads u on u.id = r.ecg_upload_id
    where r.id = run_id
  ));

create or replace function public.soft_delete_ecg_upload(p_upload_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_patient uuid;
begin
  if not public.is_google_clinician() then return false; end if;
  update ecg_uploads set deleted_at = now()
   where id = p_upload_id and clinician_id = auth.uid() and deleted_at is null
   returning patient_id into v_patient;
  if not found then return false; end if;
  insert into audit_log (clinician_id, patient_id, action, entity_table, entity_id)
  values (auth.uid(), v_patient, 'soft_delete', 'ecg_uploads', p_upload_id);
  return true;
end;
$$;

create or replace function public.restore_ecg_upload(p_upload_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_patient uuid;
begin
  if not public.is_google_clinician() then return false; end if;
  update ecg_uploads set deleted_at = null
   where id = p_upload_id and clinician_id = auth.uid() and deleted_at is not null
   returning patient_id into v_patient;
  if not found then return false; end if;
  insert into audit_log (clinician_id, patient_id, action, entity_table, entity_id)
  values (auth.uid(), v_patient, 'restore', 'ecg_uploads', p_upload_id);
  return true;
end;
$$;

create or replace function public.get_deletion_log(p_limit integer default 200)
returns table (
  id bigint, action text, created_at timestamptz, actor_name text, actor_is_me boolean,
  ecg_upload_id uuid, record_code text, subject_code text, currently_deleted boolean
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.action, a.created_at, public.account_display_name(a.clinician_id),
         a.clinician_id = auth.uid(), a.entity_id, u.record_code, cp.subject_code,
         u.deleted_at is not null
    from audit_log a
    join clinician_patients cp on cp.patient_id = a.patient_id
     and cp.clinician_id = auth.uid() and cp.deleted_at is null
    left join ecg_uploads u on u.id = a.entity_id
   where public.is_google_clinician()
     and a.action in ('soft_delete', 'restore') and a.entity_table = 'ecg_uploads'
   order by a.created_at desc, a.id desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

-- This hook was only used to restrict new accounts to one school domain.
-- Keep it compatible with the configured Supabase hook, but allow all emails.
create or replace function public.hook_restrict_signup_domain(event jsonb)
returns jsonb
language sql
as $$ select '{}'::jsonb $$;
