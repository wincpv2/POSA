import { supabase } from './supabase';

// Patients open their links in the POSA app only, so every link the clinician
// shares uses the app's own scheme (app.json "scheme"), whether it was
// created on the web or in the app. Tapping it on a phone with POSA installed
// opens the patient screen; the in-app Scan QR / Paste link accept it too.
const APP_SCHEME = 'posaapp';
const appLink = (path: string) => `${APP_SCHEME}://${path}`;

export type RecentEcgUpload = {
  id: string;
  patientId: string;
  clinicianId: string; // who uploaded it: only they can delete it
  recordCode: string;
  subjectCode: string;
  status: string;
  createdAt: string;
  ageYears: number | null;
  sex: string | null;
  bmi: number | null;
  samplingRateHz: number | null;
  leadConfiguration: string | null;
  originalFilename: string | null;
  durationSeconds: number | null;
  latestRun: PredictionRun | null;
};

export type PredictionRun = {
  id: string;
  ecg_upload_id: string;
  model_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress_percent: number;
  total_minutes: number | null;
  apnea_minutes: number | null;
  apnea_percent: number | null;
  error_message: string | null;
  created_at: string;
};

export type PredictionMinute = {
  run_id: string;
  minute_index: number;
  apnea_probability: number;
  is_apnea: boolean;
};

// ecg_uploads' own RLS already scopes this to studies the signed-in clinician
// can see (their own uploads, plus any patient they're attached to via
// clinician_patients) — no manual clinician_id filter needed here.
export async function listRecentEcgUploads(limit = 10): Promise<RecentEcgUpload[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) return [];

  const { data: uploads, error: uploadsError } = await supabase
    .from('ecg_uploads')
    .select('id, record_code, status, created_at, patient_id, clinician_id, age_years, sampling_rate_hz, lead_configuration, original_filename, duration_seconds, patients(sex, bmi)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (uploadsError) throw uploadsError;
  if (!uploads || uploads.length === 0) return [];

  // subject_code is per-clinician (clinician_patients), not on patients itself —
  // look up this clinician's own label for each patient in the list.
  const patientIds = [...new Set(uploads.map((row) => row.patient_id))];
  const { data: relations, error: relationsError } = await supabase
    .from('clinician_patients')
    .select('patient_id, subject_code')
    .eq('clinician_id', clinicianId)
    .in('patient_id', patientIds);
  if (relationsError) throw relationsError;

  const subjectCodeByPatient = new Map((relations ?? []).map((r) => [r.patient_id, r.subject_code]));
  const { data: runs, error: runsError } = await supabase
    .from('prediction_runs')
    .select('id, ecg_upload_id, model_id, status, progress_percent, total_minutes, apnea_minutes, apnea_percent, error_message, created_at')
    .in('ecg_upload_id', uploads.map((row) => row.id))
    .order('created_at', { ascending: false });
  if (runsError) throw runsError;
  const latestRunByUpload = new Map<string, PredictionRun>();
  for (const run of (runs ?? []) as PredictionRun[]) if (!latestRunByUpload.has(run.ecg_upload_id)) latestRunByUpload.set(run.ecg_upload_id, run);

  return uploads.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    clinicianId: row.clinician_id,
    recordCode: row.record_code ?? row.id.slice(0, 8),
    subjectCode: subjectCodeByPatient.get(row.patient_id) ?? '—',
    status: row.status,
    createdAt: row.created_at,
    ageYears: row.age_years,
    sex: row.patients?.sex ?? null,
    bmi: row.patients?.bmi ?? null,
    samplingRateHz: row.sampling_rate_hz,
    leadConfiguration: row.lead_configuration,
    originalFilename: row.original_filename,
    durationSeconds: row.duration_seconds,
    latestRun: latestRunByUpload.get(row.id) ?? null,
  }));
}

export async function getLatestPredictionRun(uploadId: string): Promise<PredictionRun | null> {
  const { data, error } = await supabase.from('prediction_runs')
    .select('id, ecg_upload_id, model_id, status, progress_percent, total_minutes, apnea_minutes, apnea_percent, error_message, created_at')
    .eq('ecg_upload_id', uploadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as PredictionRun | null;
}

export async function listPredictionMinutes(runId: string): Promise<PredictionMinute[]> {
  const { data, error } = await supabase.from('prediction_minutes')
    .select('run_id, minute_index, apnea_probability, is_apnea')
    .eq('run_id', runId).order('minute_index');
  if (error) throw error;
  return data ?? [];
}

export const SYMPTOM_TAGS = ['Chest pain', 'Palpitations', 'Shortness of breath', 'Dizziness'] as const;
export type SymptomTag = (typeof SYMPTOM_TAGS)[number];
export type EcgSymptomEvent = {
  id: string;
  ecg_upload_id: string;
  occurred_at_seconds: number;
  symptoms: SymptomTag[];
  created_by: string;
  created_at: string;
};

export async function listSymptomEvents(uploadId: string): Promise<EcgSymptomEvent[]> {
  const { data, error } = await supabase
    .from('ecg_symptom_events')
    .select('id, ecg_upload_id, occurred_at_seconds, symptoms, created_by, created_at')
    .eq('ecg_upload_id', uploadId)
    .order('occurred_at_seconds');
  if (error) throw error;
  return (data ?? []) as EcgSymptomEvent[];
}

export async function addSymptomEvent(uploadId: string, seconds: number, symptoms: SymptomTag[]): Promise<EcgSymptomEvent> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Sign in again before recording symptoms.');
  const uniqueSymptoms = [...new Set(symptoms)].filter((item): item is SymptomTag => SYMPTOM_TAGS.includes(item));
  if (!Number.isFinite(seconds) || seconds < 0 || uniqueSymptoms.length === 0) throw new Error('Select at least one symptom at a valid recording time.');

  const { data, error } = await supabase.from('ecg_symptom_events').insert({
    ecg_upload_id: uploadId,
    occurred_at_seconds: Number(seconds.toFixed(3)),
    symptoms: uniqueSymptoms,
    created_by: clinicianId,
  }).select('id, ecg_upload_id, occurred_at_seconds, symptoms, created_by, created_at').single();
  if (error) throw error;
  return data as EcgSymptomEvent;
}

export async function deleteSymptomEvent(eventId: string): Promise<void> {
  const { data, error } = await supabase.from('ecg_symptom_events').delete().eq('id', eventId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This symptom event could not be deleted.');
}

export type RosterPatient = {
  patientId: string;
  subjectCode: string;
  sex: string | null;
  dateOfBirth: string | null;
  bmi: number | null;
};

// This clinician's own roster — patients they have an active clinician_patients
// link to. Does NOT search/match patients across other clinicians (that's the
// deliberately-deferred "matching flow" problem — see posa.md).
export async function listMyPatients(): Promise<RosterPatient[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) return [];

  const { data, error } = await supabase
    .from('clinician_patients')
    .select('patient_id, subject_code, patients(sex, date_of_birth, bmi)')
    .eq('clinician_id', clinicianId)
    .is('deleted_at', null)
    .order('added_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    patientId: row.patient_id,
    subjectCode: row.subject_code,
    sex: row.patients?.sex ?? null,
    dateOfBirth: row.patients?.date_of_birth ?? null,
    bmi: row.patients?.bmi ?? null,
  }));
}

export type NewPatientInput = {
  subjectCode: string;
  sex?: string;
  dateOfBirth?: string;
  bmi?: number;
  notes?: string;
};

// Creates a brand-new shared patient identity and immediately attaches this
// clinician to it. Does not search for an existing match first — per the
// deferred matching-flow decision, every "new patient" here is assumed new.
export async function createPatientAndAttach(input: NewPatientInput): Promise<RosterPatient> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');

  // The id is made here, not by Postgres: inserting with .select() would need the
  // new row to pass patients' SELECT policy, which only allows patients already
  // linked through clinician_patients — and the link is only created below.
  const patientId = crypto.randomUUID();
  const { error: patientError } = await supabase
    .from('patients')
    .insert({ id: patientId, sex: input.sex ?? null, date_of_birth: input.dateOfBirth ?? null, bmi: input.bmi ?? null });
  if (patientError) throw patientError;

  const { error: attachError } = await supabase.from('clinician_patients').insert({
    clinician_id: clinicianId,
    patient_id: patientId,
    subject_code: input.subjectCode,
    notes: input.notes ?? null,
  });
  if (attachError) throw attachError;

  return {
    patientId,
    subjectCode: input.subjectCode,
    sex: input.sex ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    bmi: input.bmi ?? null,
  };
}

// Reuses this clinician's patient when the subject code is already on their
// roster, otherwise creates one. Lets the Upload screen skip a patient picker.
export async function findOrCreatePatient(input: NewPatientInput): Promise<RosterPatient> {
  const roster = await listMyPatients();
  const existing = roster.find((patient) => patient.subjectCode === input.subjectCode);
  return existing ?? createPatientAndAttach(input);
}

export type EcgStudyInput = {
  patientId: string;
  recordCode: string;
  // The main signal file first (.edf / .hea / image); WFDB's .dat goes after it.
  files: { uri: string; name: string; mimeType?: string }[];
  ageYears?: number;
  leadConfiguration?: string;
  samplingRateHz?: number;
};

// Uploads every file into the private ecg-files bucket under this clinician's
// own folder (required by the bucket's INSERT policy — see
// 20260929000003_ecg_storage_bucket.sql), then records one ecg_uploads row.
export async function uploadEcgStudy(input: EcgStudyInput): Promise<{ id: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');
  if (input.files.length === 0) throw new Error('No file selected');

  const folder = `${clinicianId}/${Date.now()}-${input.recordCode}`;
  const paths: string[] = [];
  for (const file of input.files) {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const path = `${folder}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('ecg-files')
      .upload(path, blob, { contentType: file.mimeType ?? 'application/octet-stream' });
    if (uploadError) throw uploadError;
    paths.push(path);
  }

  const { data, error: insertError } = await supabase
    .from('ecg_uploads')
    .insert({
      patient_id: input.patientId,
      clinician_id: clinicianId,
      record_code: input.recordCode,
      storage_path: paths[0],
      original_filename: input.files.map((file) => file.name).join(' + '),
      age_years: input.ageYears ?? null,
      lead_configuration: input.leadConfiguration ?? null,
      sampling_rate_hz: input.samplingRateHz ?? null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  return { id: data.id };
}

export async function getEcgUploadOwner(uploadId: string): Promise<string> {
  const { data, error } = await supabase.from('ecg_uploads')
    .select('clinician_id').eq('id', uploadId).single();
  if (error) throw error;
  return data.clinician_id;
}

export async function uploadEcgAnnotations(
  uploadId: string,
  files: { uri: string; name: string; mimeType?: string | null }[],
): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in again before attaching annotations.');
  const { data: study, error } = await supabase.from('ecg_uploads')
    .select('clinician_id, storage_path').eq('id', uploadId).single();
  if (error) throw error;
  if (study.clinician_id !== userId) throw new Error('Only the clinician who uploaded this study can attach annotation files.');

  const filename = study.storage_path.slice(study.storage_path.lastIndexOf('/') + 1);
  const stem = filename.replace(/\.hea$/i, '').toLowerCase();
  const seen = new Set<string>();
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if ((extension !== 'qrs' && extension !== 'apn') || file.name.replace(/\.[^.]+$/, '').toLowerCase() !== stem) {
      throw new Error(`Choose .qrs or .apn annotations matching ${stem}.hea.`);
    }
    if (seen.has(extension)) throw new Error(`Choose only one .${extension} file.`);
    seen.add(extension);
  }

  const folder = study.storage_path.slice(0, study.storage_path.lastIndexOf('/'));
  for (const file of files) {
    const response = await fetch(file.uri);
    if (!response.ok) throw new Error(`Could not read ${file.name}.`);
    const blob = await response.blob();
    const { error: uploadError } = await supabase.storage.from('ecg-files').upload(
      `${folder}/${file.name}`,
      blob,
      { contentType: file.mimeType ?? 'application/octet-stream', upsert: true },
    );
    if (uploadError) throw uploadError;
  }
}

// Soft delete: the row and its files are kept, it just stops appearing (see
// 20261004000005_soft_delete_ecg_upload.sql). Only the uploader may do it.
export async function softDeleteEcgUpload(uploadId: string): Promise<void> {
  const { data, error } = await supabase.rpc('soft_delete_ecg_upload', { p_upload_id: uploadId });
  if (error) throw error;
  if (!data) throw new Error('Only the clinician who uploaded this study can delete it.');
}

export async function restoreEcgUpload(uploadId: string): Promise<void> {
  const { data, error } = await supabase.rpc('restore_ecg_upload', { p_upload_id: uploadId });
  if (error) throw error;
  if (!data) throw new Error('This study could not be restored.');
}

export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

// ---- Sharing one study with a patient (QR code / link, no patient login) ----

export type ShareLink = { token: string; url: string; expiresAt: string };

// A new 64-hex-char token (256 random bits) for one study. The link is the
// patient's only credential, so it expires (30 days by default) and the
// clinician can create a fresh one at any time.
export async function createShareLink(ecgUploadId: string): Promise<ShareLink> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');

  const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  const { data, error } = await supabase
    .from('study_share_links')
    .insert({ token, ecg_upload_id: ecgUploadId, created_by: clinicianId })
    .select('expires_at')
    .single();
  if (error) throw error;

  return { token, url: appLink(`shared/${token}`), expiresAt: data.expires_at };
}

export type SharedStudy = {
  recordCode: string | null;
  createdAt: string;
  status: string;
  samplingRateHz: number | null;
  leadConfiguration: string | null;
  expiresAt: string;
  apneaMinutes: number | null;
  totalMinutes: number | null;
  apneaPercent: number | null;
  patientExplanation: string | null;
  approvedAt: string | null;
};

// Works without signing in: get_shared_study only returns the study for a
// valid, unexpired, unrevoked token, and never the patient's identity.
export async function getSharedStudy(token: string): Promise<SharedStudy | null> {
  const { data, error } = await supabase.rpc('get_shared_study', { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    recordCode: row.record_code,
    createdAt: row.created_at,
    status: row.status,
    samplingRateHz: row.sampling_rate_hz,
    leadConfiguration: row.lead_configuration,
    expiresAt: row.expires_at,
    apneaMinutes: row.apnea_minutes,
    totalMinutes: row.total_minutes,
    apneaPercent: row.apnea_percent,
    patientExplanation: row.patient_explanation,
    approvedAt: row.approved_at,
  };
}

export type PatientLink = { kind: 'study' | 'dashboard'; token: string };

// Accepts a full link (http://…/p/<token> for a dashboard, …/shared/<token> for
// one study, or posaapp://…) or a bare token, as scanned or pasted by the
// patient. A bare token is treated as a dashboard link.
export function linkFromInput(input: string): PatientLink | null {
  const text = input.trim().toLowerCase();
  const path = text.match(/\/(p|shared)\/([0-9a-f]{64})(?:[/?#]|$)/);
  if (path) return { kind: path[1] === 'p' ? 'dashboard' : 'study', token: path[2] };
  return /^[0-9a-f]{64}$/.test(text) ? { kind: 'dashboard', token: text } : null;
}

export function tokenFromInput(input: string): string | null {
  return linkFromInput(input)?.token ?? null;
}

// ---- Patient dashboard (every night for one patient, no patient login) ----

// One link per patient. Valid 90 days by default; it keeps showing nights
// uploaded after it was created.
export async function createPatientDashboardLink(patientId: string): Promise<ShareLink> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');

  const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  const { data, error } = await supabase
    .from('patient_share_links')
    .insert({ token, patient_id: patientId, created_by: clinicianId })
    .select('expires_at')
    .single();
  if (error) throw error;

  return { token, url: appLink(`p/${token}`), expiresAt: data.expires_at };
}

export type DashboardNight = {
  recordCode: string | null;
  createdAt: string;
  status: string;
  samplingRateHz: number | null;
  leadConfiguration: string | null;
  patientExplanation: string | null; // only once the clinician approved that night's report
  approvedAt: string | null;
  apneaMinutes: number | null;
  totalMinutes: number | null;
  apneaPercent: number | null;
};
export type PatientDashboard = { expiresAt: string; nights: DashboardNight[] };

type DashboardJson = {
  expires_at: string;
  studies: { record_code: string | null; created_at: string; status: string; sampling_rate_hz: number | null; lead_configuration: string | null; apnea_minutes: number | null; total_minutes: number | null; apnea_percent: number | null; patient_explanation: string | null; approved_at: string | null }[];
};

// Works without signing in; null when the link is wrong, expired or revoked.
export async function getPatientDashboard(token: string): Promise<PatientDashboard | null> {
  const { data, error } = await supabase.rpc('get_patient_dashboard', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const json = data as unknown as DashboardJson;
  return {
    expiresAt: json.expires_at,
    nights: json.studies.map((s) => ({
      recordCode: s.record_code,
      createdAt: s.created_at,
      status: s.status,
      samplingRateHz: s.sampling_rate_hz,
      leadConfiguration: s.lead_configuration,
      patientExplanation: s.patient_explanation,
      approvedAt: s.approved_at,
      apneaMinutes: s.apnea_minutes,
      totalMinutes: s.total_minutes,
      apneaPercent: s.apnea_percent,
    })),
  };
}

// ---- Clinician-written report (opinion, patient explanation, sign-off) ----

export type ReportStatus = 'Draft' | 'Reviewed' | 'Approved';
export type StudyReport = {
  clinicianOpinion: string;
  patientExplanation: string;
  status: ReportStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
};

const toStatus = (value: string): ReportStatus => value === 'approved' ? 'Approved' : value === 'reviewed' ? 'Reviewed' : 'Draft';
const REPORT_COLUMNS = 'clinician_opinion, patient_explanation, status, reviewed_by_name, reviewed_at, approved_by_name, approved_at';
type ReportRow = { clinician_opinion: string; patient_explanation: string; status: string; reviewed_by_name: string | null; reviewed_at: string | null; approved_by_name: string | null; approved_at: string | null };
const toReport = (row: ReportRow): StudyReport => ({
  clinicianOpinion: row.clinician_opinion,
  patientExplanation: row.patient_explanation,
  status: toStatus(row.status),
  reviewedByName: row.reviewed_by_name,
  reviewedAt: row.reviewed_at,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
});
export const EMPTY_REPORT: StudyReport = { clinicianOpinion: '', patientExplanation: '', status: 'Draft', reviewedByName: null, reviewedAt: null, approvedByName: null, approvedAt: null };

export async function getStudyReport(uploadId: string): Promise<StudyReport> {
  const { data, error } = await supabase.from('study_reports').select(REPORT_COLUMNS).eq('ecg_upload_id', uploadId).maybeSingle();
  if (error) throw error;
  return data ? toReport(data) : EMPTY_REPORT;
}

// Saves the text; the row is created on first save (always as draft).
export async function saveStudyReportText(uploadId: string, text: { clinicianOpinion: string; patientExplanation: string }): Promise<StudyReport> {
  const { data, error } = await supabase
    .from('study_reports')
    .upsert({ ecg_upload_id: uploadId, clinician_opinion: text.clinicianOpinion, patient_explanation: text.patientExplanation }, { onConflict: 'ecg_upload_id' })
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;
  return toReport(data);
}

// Moves the report one stage. Who signed and when is stamped by the database
// (study_reports_sign_off trigger), which also enforces the rules.
export async function setStudyReportStatus(uploadId: string, status: ReportStatus): Promise<StudyReport> {
  const { data, error } = await supabase
    .from('study_reports')
    .update({ status: status.toLowerCase() })
    .eq('ecg_upload_id', uploadId)
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;
  return toReport(data);
}

// ---- Approved report PDFs kept in Supabase (bucket report-pdfs) ----

export type SavedReportPdf = { id: string; storagePath: string; approvedByName: string | null; approvedAt: string | null; createdAt: string };

export async function listReportPdfs(uploadId: string): Promise<SavedReportPdf[]> {
  const { data, error } = await supabase
    .from('report_pdfs')
    .select('id, storage_path, approved_by_name, approved_at, created_at')
    .eq('ecg_upload_id', uploadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, storagePath: row.storage_path, approvedByName: row.approved_by_name, approvedAt: row.approved_at, createdAt: row.created_at }));
}

// Uploads the signed PDF into the clinician's own folder, then records it.
// The database only accepts this while the report is approved, and keeps one
// PDF per approval (report_pdfs_one_per_approval). An approval that is already
// stored is skipped before anything is uploaded: returns 'already-saved'.
export async function saveReportPdf(uploadId: string, recordCode: string, pdf: Blob, signed: { approvedByName: string | null; approvedAt: string | null }): Promise<'saved' | 'already-saved'> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');

  if (!signed.approvedAt) throw new Error('The report is not approved.');
  const { data: existing, error: existingError } = await supabase
    .from('report_pdfs')
    .select('id')
    .eq('ecg_upload_id', uploadId)
    .eq('approved_at', signed.approvedAt)
    .limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) return 'already-saved';

  const path = `${clinicianId}/${uploadId}/${Date.now()}-${recordCode || 'report'}.pdf`;
  const { error: uploadError } = await supabase.storage.from('report-pdfs').upload(path, pdf, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('report_pdfs').insert({
    ecg_upload_id: uploadId,
    storage_path: path,
    created_by: clinicianId,
    approved_by_name: signed.approvedByName,
    approved_at: signed.approvedAt,
  });
  // Saved at the same moment from another tab: the unique rule kept one copy.
  if (error?.code === '23505') return 'already-saved';
  if (error) throw error;
  return 'saved';
}

// A short-lived link to open or download a saved PDF.
export async function reportPdfUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('report-pdfs').createSignedUrl(storagePath, 120, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

// ---- Deletion log (who deleted / restored which study) ----

export type DeletionLogEntry = {
  id: number;
  action: 'soft_delete' | 'restore';
  createdAt: string;
  actorName: string;
  actorIsMe: boolean;
  uploadId: string | null;
  recordCode: string | null;
  subjectCode: string | null; // this clinician's own label for the patient
  currentlyDeleted: boolean;
};

// Entries for every patient this clinician is attached to, newest first
// (20261004000009_deletion_log.sql).
export async function getDeletionLog(limit = 200): Promise<DeletionLogEntry[]> {
  const { data, error } = await supabase.rpc('get_deletion_log', { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action === 'restore' ? 'restore' : 'soft_delete',
    createdAt: row.created_at,
    actorName: row.actor_name,
    actorIsMe: row.actor_is_me,
    uploadId: row.ecg_upload_id,
    recordCode: row.record_code,
    subjectCode: row.subject_code,
    currentlyDeleted: row.currently_deleted,
  }));
}
