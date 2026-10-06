alter table public.prediction_runs
  add column summary_updated_at timestamptz;

update public.prediction_runs
set summary_updated_at = created_at
where summary_status in ('queued', 'processing')
  and summary_updated_at is null;
