-- Soft delete (and undo) for a study. A plain client UPDATE can't do it: the
-- new row (deleted_at set) no longer passes ecg_uploads' SELECT policy, and
-- Postgres rejects an UPDATE whose result the caller couldn't see (42501).
-- These functions do the permission check themselves: only the clinician who
-- uploaded the study may delete or restore it. Rows and files are kept; every
-- change is written to audit_log.

create function public.soft_delete_ecg_upload(p_upload_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
begin
  update ecg_uploads
     set deleted_at = now()
   where id = p_upload_id
     and clinician_id = auth.uid()
     and deleted_at is null
  returning patient_id into v_patient;

  if not found then
    return false;
  end if;

  insert into audit_log (clinician_id, patient_id, action, entity_table, entity_id)
  values (auth.uid(), v_patient, 'soft_delete', 'ecg_uploads', p_upload_id);
  return true;
end;
$$;

create function public.restore_ecg_upload(p_upload_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
begin
  update ecg_uploads
     set deleted_at = null
   where id = p_upload_id
     and clinician_id = auth.uid()
     and deleted_at is not null
  returning patient_id into v_patient;

  if not found then
    return false;
  end if;

  insert into audit_log (clinician_id, patient_id, action, entity_table, entity_id)
  values (auth.uid(), v_patient, 'restore', 'ecg_uploads', p_upload_id);
  return true;
end;
$$;

revoke execute on function public.soft_delete_ecg_upload(uuid) from public, anon;
revoke execute on function public.restore_ecg_upload(uuid) from public, anon;
grant execute on function public.soft_delete_ecg_upload(uuid) to authenticated;
grant execute on function public.restore_ecg_upload(uuid) to authenticated;
