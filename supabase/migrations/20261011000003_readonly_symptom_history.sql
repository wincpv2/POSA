drop policy if exists "study owners add symptom events" on public.ecg_symptom_events;
drop policy if exists "study owners remove symptom events" on public.ecg_symptom_events;

revoke insert, delete on public.ecg_symptom_events from authenticated;
