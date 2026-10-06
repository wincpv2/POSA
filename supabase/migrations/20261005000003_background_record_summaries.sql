alter table public.prediction_runs
  add column summary_status text not null default 'not_started'
    check (summary_status in ('not_started', 'queued', 'processing', 'completed', 'failed')),
  add column summary_progress_percent integer not null default 0
    check (summary_progress_percent between 0 and 100),
  add column summary_stage text,
  add column summary_error_message text,
  add column summary_result jsonb;
