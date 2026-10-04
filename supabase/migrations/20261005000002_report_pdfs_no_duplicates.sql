-- One stored PDF per approval: the same approved version of a study's report
-- (same approved_at) can't be saved twice, even if "Save PDF to Supabase" is
-- pressed again or from two tabs. Approving again after edits gets a new
-- approved_at, so it is still saved as a new version.
alter table report_pdfs
  alter column approved_at set not null,
  add constraint report_pdfs_one_per_approval unique (ecg_upload_id, approved_at);
