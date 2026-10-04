import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type StudyStatus = 'empty' | 'uploaded' | 'queued' | 'processing' | 'failed' | 'ready';
export type ReportStatus = 'Draft' | 'Reviewed' | 'Approved';

export type Study = {
  fileName: string | null;
  fileSize: number;
  format: 'wfdb' | null;
  sampleRate: number | null;
  lead: string;
  metadata: string;
  studyId: string;
  age: string;
  sex: string;
  bmi: string;
  status: StudyStatus;
  progress: number;
  reportStatus: ReportStatus;
  uploadId: string | null;
  patientId: string | null;
  durationSeconds: number;
  runId: string | null;
  errorMessage: string;
};

const initial: Study = {
  fileName: null, fileSize: 0, format: null, sampleRate: null, lead: '', metadata: '',
  studyId: '', age: '', sex: '', bmi: '', status: 'empty', progress: 0,
  reportStatus: 'Draft', uploadId: null, patientId: null, durationSeconds: 0,
  runId: null, errorMessage: '',
};

type State = {
  study: Study;
  update: (next: Partial<Study>) => void;
  reset: () => void;
  start: () => void;
  cancel: () => void;
};

const Context = createContext<State | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [study, setStudy] = useState(initial);
  const update = useCallback((next: Partial<Study>) => setStudy((current) => ({ ...current, ...next })), []);
  const reset = useCallback(() => setStudy(initial), []);
  const start = useCallback(() => update({ status: 'queued', progress: 0, reportStatus: 'Draft', errorMessage: '' }), [update]);
  const cancel = useCallback(() => update({ status: 'uploaded', progress: 0, runId: null }), [update]);

  return <Context.Provider value={{ study, update, reset, start, cancel }}>{children}</Context.Provider>;
}

export function useUploadState() {
  const value = useContext(Context);
  if (!value) throw new Error('useUploadState must be used inside UploadProvider');
  return value;
}
