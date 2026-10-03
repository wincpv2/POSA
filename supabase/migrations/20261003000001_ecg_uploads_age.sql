-- The Upload screen asks for the patient's age in years, not a date of birth.
-- Age belongs to the study (age at the time of this recording), so it lives on
-- ecg_uploads. patients.date_of_birth stays as a nullable, unused column.
alter table ecg_uploads
  add column age_years integer check (age_years between 0 and 130);
