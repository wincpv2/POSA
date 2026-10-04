-- Approved report PDFs are kept in Supabase. Every "Approve & sign" stores the
-- signed PDF; approving again after edits adds a new version (old ones stay).
-- Drafts are not stored.

insert into storage.buckets (id, name, public)
values ('report-pdfs', 'report-pdfs', false)
on conflict (id) do nothing;

create table report_pdfs (
  id uuid primary key default gen_random_uuid(),
  ecg_upload_id uuid not null references ecg_uploads (id) on delete cascade,
  storage_path text not null unique,
  approved_by_name text,
  approved_at timestamptz,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index report_pdfs_ecg_upload_id_idx on report_pdfs (ecg_upload_id, created_at desc);

alter table report_pdfs enable row level security;

-- Clinicians who can see the study can list its PDFs.
create policy "select pdfs for visible studies" on report_pdfs
  for select using (exists (select 1 from ecg_uploads u where u.id = ecg_upload_id));

-- Only for an approved report of a study the caller can see, into their own folder.
create policy "insert pdfs for approved reports" on report_pdfs
  for insert with check (
    auth.uid() = created_by
    and storage_path like auth.uid()::text || '/%'
    and exists (select 1 from ecg_uploads u where u.id = ecg_upload_id)
    and exists (select 1 from study_reports r where r.ecg_upload_id = report_pdfs.ecg_upload_id and r.status = 'approved')
  );
-- PDFs are never edited or deleted from the app (no update/delete policies).

grant select, insert on public.report_pdfs to authenticated;

-- Storage: write into your own folder; read a file only if it is listed in
-- report_pdfs for a study you can see (that table's RLS does the check).
create policy "clinicians upload report pdfs into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clinicians read report pdfs of visible studies" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-pdfs'
    and exists (select 1 from public.report_pdfs rp where rp.storage_path = storage.objects.name)
  );
