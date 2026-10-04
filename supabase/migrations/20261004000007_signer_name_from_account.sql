-- Sign-off names come from the clinician's account. profiles.display_name was
-- never filled at signup, so the report trigger fell back to "Clinician".

-- The account name: profile display name, else the Google name, else email.
create function public.account_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p.display_name), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    u.email,
    'Clinician'
  )
  from auth.users u
  left join profiles p on p.id = u.id
  where u.id = p_user;
$$;
revoke execute on function public.account_display_name(uuid) from public, anon, authenticated;

-- New accounts get their Google name straight away.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''));
  return new;
end;
$$;

-- Existing profiles with no name: fill from the account.
update profiles p
   set display_name = public.account_display_name(p.id)
 where nullif(btrim(p.display_name), '') is null;

-- The report trigger now uses the account name.
create or replace function public.study_reports_sign_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(public.account_display_name(auth.uid()), 'Clinician');
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

-- Reports already signed with the "Clinician" fallback get the real name.
-- The sign-off trigger is paused for this one fix (it would keep the old name).
alter table study_reports disable trigger study_reports_sign_off;
update study_reports set reviewed_by_name = public.account_display_name(reviewed_by)
 where reviewed_by is not null and reviewed_by_name = 'Clinician';
update study_reports set approved_by_name = public.account_display_name(approved_by)
 where approved_by is not null and approved_by_name = 'Clinician';
alter table study_reports enable trigger study_reports_sign_off;
