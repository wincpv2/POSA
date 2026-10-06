import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { downloadStudySignalsOffline, type OfflineSignalProgress } from '@/lib/inference';

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
  offlineDownload: OfflineDownload;
  retryOfflineDownload: () => void;
};

export type OfflineDownload = Omit<OfflineSignalProgress, 'status'> & {
  status: OfflineSignalProgress['status'] | 'idle' | 'failed';
  uploadId: string | null;
  runId: string | null;
  error: string;
};

const emptyOfflineDownload: OfflineDownload = {
  status: 'idle', uploadId: null, runId: null, totalMinutes: 0,
  rawMinutes: 0, filteredMinutes: 0, error: '',
};

const Context = createContext<State | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [study, setStudy] = useState(initial);
  const { session } = useAuth();
  const [offlineDownload, setOfflineDownload] = useState<OfflineDownload>(emptyOfflineDownload);
  const [offlineRetry, setOfflineRetry] = useState(0);
  const update = useCallback((next: Partial<Study>) => setStudy((current) => ({ ...current, ...next })), []);
  const reset = useCallback(() => setStudy(initial), []);
  const start = useCallback(() => update({ status: 'queued', progress: 0, reportStatus: 'Draft', errorMessage: '' }), [update]);
  const cancel = useCallback(() => update({ status: 'uploaded', progress: 0, runId: null }), [update]);
  const userId = session?.user.id;
  const { uploadId, runId, durationSeconds, status } = study;

  useEffect(() => {
    if (!userId || !uploadId || !runId || status !== 'ready' || durationSeconds <= 0) {
      return;
    }

    const controller = new AbortController();
    const totalMinutes = Math.ceil(durationSeconds / 60);
    void downloadStudySignalsOffline(userId, uploadId, runId, totalMinutes, (progress) => {
      setOfflineDownload({ ...progress, uploadId, runId, error: '' });
    }, controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setOfflineDownload((current) => ({
          ...current,
          status: 'failed',
          error: reason instanceof Error ? reason.message : 'Could not save the ECG for offline use.',
        }));
      }
    });
    return () => controller.abort();
  }, [userId, uploadId, runId, durationSeconds, status, offlineRetry]);

  const retryOfflineDownload = useCallback(() => setOfflineRetry((value) => value + 1), []);

  return <Context.Provider value={{ study, update, reset, start, cancel, offlineDownload, retryOfflineDownload }}>{children}</Context.Provider>;
}

export function useUploadState() {
  const value = useContext(Context);
  if (!value) throw new Error('useUploadState must be used inside UploadProvider');
  return value;
}
