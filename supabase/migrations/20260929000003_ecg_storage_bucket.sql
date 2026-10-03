-- Private Storage bucket for ECG files, with access consistent with the
-- clinician_patients sharing model (20260929000002): view access follows
-- ecg_uploads/clinician_patients, not just the uploader's own folder.

insert into storage.buckets (id, name, public)
values ('ecg-files', 'ecg-files', false);

-- Upload path convention: {uploader's clinician_id}/{filename} — enforced here
-- so a clinician can only ever upload into their own folder.
create policy "clinicians upload ecg files into their own folder" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ecg-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- View access mirrors ecg_uploads' own SELECT policy: any clinician with an
-- active clinician_patients link to the file's patient can view it, not just
-- whoever uploaded it — otherwise the shared-history feature would be visible
-- as a database row but the actual ECG file would still be unreachable.
create policy "clinicians view ecg files for attached patients" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ecg-files'
    and exists (
      select 1 from ecg_uploads eu
      join clinician_patients cp on cp.patient_id = eu.patient_id
      where eu.storage_path = storage.objects.name
        and cp.clinician_id = auth.uid()
        and cp.deleted_at is null
        and eu.deleted_at is null
    )
  );

-- No update/delete policy: files are immutable once uploaded, consistent with
-- the soft-delete-only design used elsewhere (ecg_uploads.deleted_at hides the
-- row; the underlying file is left alone, cleanup is a service-role concern).
