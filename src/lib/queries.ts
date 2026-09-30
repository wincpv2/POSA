import { supabase } from './supabase';

export type RecentEcgUpload = {
  id: string;
  recordCode: string;
  subjectCode: string;
  status: string;
  createdAt: string;
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
    .select('id, record_code, status, created_at, patient_id')
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

  return uploads.map((row) => ({
    id: row.id,
    recordCode: row.record_code ?? row.id.slice(0, 8),
    subjectCode: subjectCodeByPatient.get(row.patient_id) ?? '—',
    status: row.status,
    createdAt: row.created_at,
  }));
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

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({ sex: input.sex ?? null, date_of_birth: input.dateOfBirth ?? null, bmi: input.bmi ?? null })
    .select('id, sex, date_of_birth, bmi')
    .single();
  if (patientError) throw patientError;

  const { error: attachError } = await supabase.from('clinician_patients').insert({
    clinician_id: clinicianId,
    patient_id: patient.id,
    subject_code: input.subjectCode,
    notes: input.notes ?? null,
  });
  if (attachError) throw attachError;

  return {
    patientId: patient.id,
    subjectCode: input.subjectCode,
    sex: patient.sex,
    dateOfBirth: patient.date_of_birth,
    bmi: patient.bmi,
  };
}

export type EcgStudyInput = {
  patientId: string;
  file: { uri: string; name: string; mimeType?: string };
  leadConfiguration?: string;
  samplingRateHz?: number;
};

// Uploads the file into the private ecg-files bucket under this clinician's
// own folder (required by the bucket's INSERT policy — see
// 20260929000003_ecg_storage_bucket.sql), then records the upload row.
export async function uploadEcgStudy(input: EcgStudyInput): Promise<{ id: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const clinicianId = userData.user?.id;
  if (!clinicianId) throw new Error('Not signed in');

  const response = await fetch(input.file.uri);
  const blob = await response.blob();
  const storagePath = `${clinicianId}/${Date.now()}-${input.file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('ecg-files')
    .upload(storagePath, blob, { contentType: input.file.mimeType ?? 'application/octet-stream' });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from('ecg_uploads')
    .insert({
      patient_id: input.patientId,
      clinician_id: clinicianId,
      storage_path: storagePath,
      original_filename: input.file.name,
      lead_configuration: input.leadConfiguration ?? null,
      sampling_rate_hz: input.samplingRateHz ?? null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  return { id: data.id };
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
