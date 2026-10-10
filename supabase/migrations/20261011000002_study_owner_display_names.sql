create or replace function public.get_visible_study_owner_names(p_upload_ids uuid[])
returns table (clinician_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.clinician_id,
         coalesce(
           nullif(nullif(btrim(p.display_name), ''), account.email),
           nullif(btrim(account.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(account.raw_user_meta_data ->> 'name'), ''),
           'Clinician'
         )
    from public.ecg_uploads u
    left join public.profiles p on p.id = u.clinician_id
    left join auth.users account on account.id = u.clinician_id
   where public.is_google_clinician()
     and auth.uid() is not null
     and u.deleted_at is null
     and cardinality(coalesce(p_upload_ids, '{}'::uuid[])) between 1 and 1000
     and u.id = any(coalesce(p_upload_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_visible_study_owner_names(uuid[]) from public, anon;
grant execute on function public.get_visible_study_owner_names(uuid[]) to authenticated;
