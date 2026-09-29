-- models: model registry metadata (name, version, type, artifact location, metrics).
-- Generic bookkeeping — doesn't depend on knowing the ML output format itself.
create table models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  model_type text not null check (model_type in ('catboost', 'xgboost', 'cnn', 'ensemble')),
  artifact_path text,
  metrics jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, version)
);

alter table models enable row level security;

-- any authenticated user can see the active model list (needed for "Model Selection" in the app)
create policy "read active models" on models
  for select to authenticated
  using (is_active);

-- no insert/update/delete policy: only the service_role key (which bypasses RLS)
-- may register or change models, e.g. from a deploy pipeline.
