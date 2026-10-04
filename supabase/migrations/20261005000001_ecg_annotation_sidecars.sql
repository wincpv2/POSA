-- Let a study's original uploader read and replace only its paired WFDB annotations.
create policy "uploaders read ecg annotation sidecars"
on storage.objects for select to authenticated
using (
  bucket_id = 'ecg-files'
  and exists (
    select 1 from public.ecg_uploads eu
    where eu.clinician_id = auth.uid()
      and lower(storage.objects.name) in (
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.qrs', 'i')),
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.apn', 'i'))
      )
  )
);

create policy "uploaders replace ecg annotation sidecars"
on storage.objects for update to authenticated
using (
  bucket_id = 'ecg-files'
  and exists (
    select 1 from public.ecg_uploads eu
    where eu.clinician_id = auth.uid()
      and lower(storage.objects.name) in (
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.qrs', 'i')),
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.apn', 'i'))
      )
  )
)
with check (
  bucket_id = 'ecg-files'
  and exists (
    select 1 from public.ecg_uploads eu
    where eu.clinician_id = auth.uid()
      and lower(storage.objects.name) in (
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.qrs', 'i')),
        lower(regexp_replace(eu.storage_path, '[.]hea$', '.apn', 'i'))
      )
  )
);
