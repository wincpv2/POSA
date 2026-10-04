create table public.ecg_symptom_events (
  id uuid primary key default gen_random_uuid(),
  ecg_upload_id uuid not null references public.ecg_uploads(id) on delete cascade,
  occurred_at_seconds numeric(12, 3) not null check (occurred_at_seconds >= 0),
  symptoms text[] not null check (
    cardinality(symptoms) between 1 and 4
    and symptoms <@ array['Chest pain', 'Palpitations', 'Shortness of breath', 'Dizziness']::text[]
  ),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index ecg_symptom_events_study_time_idx
  on public.ecg_symptom_events (ecg_upload_id, occurred_at_seconds);

alter table public.ecg_symptom_events enable row level security;

create policy "read symptom events for visible studies" on public.ecg_symptom_events
  for select to authenticated
  using (exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id));

create policy "insert symptom events for visible studies" on public.ecg_symptom_events
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.ecg_uploads u where u.id = ecg_upload_id)
  );

create policy "delete own symptom events" on public.ecg_symptom_events
  for delete to authenticated
  using (created_by = auth.uid());

grant select, insert, delete on public.ecg_symptom_events to authenticated;

create or replace function public.guard_ecg_symptom_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
  v_duration integer;
  v_status text;
begin
  v_upload_id := case when tg_op = 'DELETE' then old.ecg_upload_id else new.ecg_upload_id end;

  select duration_seconds into v_duration
  from public.ecg_uploads where id = v_upload_id;

  select status into v_status
  from public.study_reports where ecg_upload_id = v_upload_id;

  if v_status = 'approved' then
    raise exception 'Symptoms are locked while the study report is approved.';
  end if;

  if tg_op <> 'DELETE' and v_duration is not null and new.occurred_at_seconds > v_duration then
    raise exception 'Symptom time must be within the recording duration.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger guard_ecg_symptom_event
  before insert or delete on public.ecg_symptom_events
  for each row execute function public.guard_ecg_symptom_event();

revoke all on function public.guard_ecg_symptom_event() from public, anon, authenticated;
