# POSA — Predictor of Obstructive Sleep Apnea

A React Native (Expo) app that gives clinicians a workstation to upload a patient's ECG,
run OSA (obstructive sleep apnea) risk prediction on it, and review the results.

## Team

| Role | Person |
|---|---|
| UI/UX Designer | Pisit Pipathanabenjakul |
| Researcher | Papangkorn Bennarong |
| ML Engineer | Worraprach Srirattananon |
| Mobile App Developer (frontend↔backend, storage/database) | Panut Anan |

## Tech stack

- **App**: Expo / React Native, `expo-router` file-based routing
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage, Row Level Security
- **Auth**: Google OAuth via Supabase Auth
- **ML**: CatBoost / XGBoost / CNN ensemble on ECG-derived features (RRI, EDR, CPC,
  STFT/CWT), trained on PhysioNet Apnea-ECG, validated on UCDDB

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in the values from the Supabase dashboard
(**Project Settings → Data API** for the URL, **Project Settings → API Keys** for
the key):

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```

**Never use the `service_role` key here.** The app only ever uses the anon/publishable
key, paired with Row Level Security — `service_role` bypasses RLS entirely and must
never ship in client code. **Never commit `.env`** — it's git-ignored; `.env.example`
is the only one that should be committed.

### 3. Run the app

```bash
npx expo start
```

## Backend setup (Supabase)

Migrations live in `supabase/migrations/` and are applied with the
[Supabase CLI](https://supabase.com/docs/guides/cli) (no global install needed —
`npx supabase` works directly):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Generate TypeScript types from the live schema after any migration change:

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

### Schema overview

- `profiles` — a clinician's account (1:1 with `auth.users`), includes `consent_accepted`
- `patients` — a shared patient identity (sex, date of birth, BMI) — not owned by any
  single clinician
- `clinician_patients` — join table: one row per clinician↔patient relationship
  (subject code, notes). This is what lets multiple clinicians share a patient's
  history — any clinician with an active link to a patient sees all of that
  patient's studies, not just the ones they uploaded
- `ecg_uploads` — one row per uploaded ECG study, file stored in the private
  `ecg-files` Storage bucket
- `models` — ML model registry (read-only to clinicians; writes are service-role only)
- `predictions`, `prediction_minutes`, `sleep_sessions` — **not yet built**, waiting
  on the ML team's output contract (label granularity, confidence score, time unit)
- `audit_log` — provenance trail, service-role access only

All tables use Row Level Security. Clinical/audit tables (`patients`, `ecg_uploads`)
use soft delete (`deleted_at`) instead of hard delete, to preserve an audit trail.

## Security notes

- RLS is the real access-control boundary — client-side filtering is convenience only.
- `service_role` key never ships in the app; only the anon/publishable key does.
- Secrets (`service_role` key, OAuth client secret, real patient data) must never
  reach git. Run a git-history check for `.env` before any push if in doubt:
  `git log --all --full-history -- .env` should return nothing.
- The app must show the responsible-AI disclaimer and separate consent from login
  before storing any health data (see `src/components/login-screen.tsx`).

## Project status

See the team meeting summary for current progress, what's left, and open decisions
(patient-login for read-only access, cross-clinician patient matching, and the
Upload screen's patient-selection UI).
