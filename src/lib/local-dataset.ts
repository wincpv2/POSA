import type { Session } from '@supabase/supabase-js';
import type { PredictionRun, RecentEcgUpload } from './queries';

export const datasetMode = process.env.EXPO_PUBLIC_POSA_DATASET_MODE === '1';

export type ArchiveRecord = {
  id: string;
  labelledMinutes: number;
  apneaMinutes: number;
  samplingRateHz: number;
  channels: { name: string; durationSeconds: number }[];
  prediction?: { run: PredictionRun } | null;
};

export async function archiveRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/dataset${path}`, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Local archive returned ${response.status}.`);
  return payload;
}

export function archiveRun(record: ArchiveRecord): PredictionRun {
  if (record.prediction) return record.prediction.run;
  return {
    id: record.id, ecg_upload_id: record.id, model_id: 'archive-annotations',
    status: 'completed', progress_percent: 100, total_minutes: record.labelledMinutes,
    apnea_minutes: null,
    apnea_percent: null,
    created_at: '2000-02-10T00:00:00Z', error_message: null,
    summary_status: 'completed', summary_progress_percent: 100, summary_stage: null,
    summary_error_message: null, summary_updated_at: null,
  };
}

export async function archiveUploads(limit: number): Promise<RecentEcgUpload[]> {
  const records = await archiveRequest<ArchiveRecord[]>('');
  const local = await localRequest<LocalStudy[]>('/studies');
  const uploads: RecentEcgUpload[] = local.map((record) => ({
    id: record.id, patientId: record.patient.patientId, clinicianId: 'local-archive-reader', ownerDisplayName: 'Local files',
    recordCode: record.recordCode, subjectCode: record.patient.subjectCode, status: 'completed', createdAt: record.createdAt,
    ageYears: record.ageYears ?? null, sex: record.patient.sex, bmi: record.patient.bmi,
    samplingRateHz: 100, leadConfiguration: 'ECG', originalFilename: record.files.join(' + '),
    durationSeconds: record.durationSeconds,
    latestRun: record.prediction?.run ?? { ...archiveRun({ id: record.id, labelledMinutes: Math.ceil(record.durationSeconds / 60), apneaMinutes: 0, samplingRateHz: 100, channels: [] }),
      model_id: 'local-waveform', summary_status: 'failed', summary_error_message: 'The recording is saved locally. Model analysis requires a trained checkpoint.' },
  }));
  return [...uploads, ...records.map((record) => ({
    id: record.id, patientId: record.id, clinicianId: 'physionet', ownerDisplayName: 'PhysioNet',
    recordCode: record.id, subjectCode: record.id, status: 'completed', createdAt: '2000-02-10T00:00:00Z',
    ageYears: null, sex: null, bmi: null, samplingRateHz: record.samplingRateHz,
    leadConfiguration: 'ECG', originalFilename: `${record.id}.hea`,
    durationSeconds: record.channels[0].durationSeconds, latestRun: archiveRun(record),
  }))].slice(0, limit);
}

type LocalStudy = {
  id: string; recordCode: string; createdAt: string; ageYears?: number; durationSeconds: number; files: string[];
  patient: { patientId: string; subjectCode: string; sex: string | null; bmi: number | null };
  prediction?: { run: PredictionRun } | null;
};

export async function localRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/local${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Local storage returned ${response.status}.`);
  return payload;
}

export async function uploadLocalStudy(input: { files: { uri: string; name: string }[] }) {
  const files = [];
  for (const file of input.files) {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(blob);
    });
    files.push({ name: file.name, data });
  }
  return localRequest<{ id: string; clinicianId: string }>('/studies', { ...input, files });
}

// Archive browsing has its own identity so cached records cannot mix with clinician accounts.
export const archiveSession = {
  user: { id: 'local-archive-reader', email: '', user_metadata: { full_name: 'Local archive' } },
} as unknown as Session;
