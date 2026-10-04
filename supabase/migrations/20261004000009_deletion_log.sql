-- Deletion log: who deleted or restored which study, and when.
-- soft_delete_ecg_upload / restore_ecg_upload already write audit_log, which
-- stays closed to the app (no policies). This function lets a clinician read
-- those entries for every patient they are currently attached to, so the
-- doctors who share a patient can see who removed one of that patient's
-- studies. The deleted study itself stays hidden elsewhere in the app.
create function public.get_deletion_log(p_limit integer default 200)
returns table (
  id bigint,
  action text,
  created_at timestamptz,
  actor_name text,
  actor_is_me boolean,
  ecg_upload_id uuid,
  record_code text,
  subject_code text,
  currently_deleted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
         a.action,
         a.created_at,
         public.account_display_name(a.clinician_id),
         a.clinician_id = auth.uid(),
         a.entity_id,
         u.record_code,
         cp.subject_code,
         u.deleted_at is not null
    from audit_log a
    join clinician_patients cp
      on cp.patient_id = a.patient_id
     and cp.clinician_id = auth.uid()
     and cp.deleted_at is null
    left join ecg_uploads u on u.id = a.entity_id
   where a.action in ('soft_delete', 'restore')
     and a.entity_table = 'ecg_uploads'
   order by a.created_at desc, a.id desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke execute on function public.get_deletion_log(integer) from public, anon;
grant execute on function public.get_deletion_log(integer) to authenticated;
