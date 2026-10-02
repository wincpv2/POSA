import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ApneaEvent = { id: number; start: string; end: string; sample?: boolean };
export type SummaryMetrics = { rPeakCount: number; annotationRuns: number; medianHrBpm: number; sdnnMs: number; rmssdMs: number; validRrPercent: number };
export type Study = {
  fileName: string | null; fileSize: number; format: 'edf' | 'wfdb' | 'image' | 'unsupported' | null;
  sampleRate: number | null; lead: string; metadata: string; studyId: string; age: string; sex: string; bmi: string; severity: string;
  apneaBurden: string; apneaMinutes: string; noEventMinutes: string; duration: string;
  status: 'empty' | 'uploaded' | 'processing' | 'failed' | 'ready'; progress: number;
  events: ApneaEvent[]; summaryMetrics: SummaryMetrics | null; reportStatus: 'Draft' | 'Reviewed' | 'Approved';
};

const times = [['00:42:00','00:47:00'],['00:49:00','01:29:00'],['01:40:00','01:56:00'],['03:03:00','03:25:00'],['03:53:00','04:01:00'],['04:12:00','04:18:00'],['04:26:00','04:33:00'],['04:41:00','04:46:00'],['04:55:00','05:02:00'],['05:10:00','05:14:00'],['05:22:00','05:29:00'],['05:36:00','05:42:00'],['05:51:00','05:56:00'],['06:04:00','06:10:00'],['06:18:00','06:23:00'],['06:31:00','06:36:00'],['06:42:00','06:47:00']];
export const sampleEvents: ApneaEvent[] = times.map(([start, end], index) => ({ id: index + 1, start, end, sample: true }));
const initial: Study = { fileName: null, fileSize: 0, format: null, sampleRate: null, lead: '', metadata: '', studyId: '', age: '', sex: '', bmi: '', severity: '', apneaBurden: '', apneaMinutes: '', noEventMinutes: '', duration: '', status: 'empty', progress: 0, events: [], summaryMetrics: null, reportStatus: 'Draft' };
type State = { study: Study; update: (next: Partial<Study>) => void; reset: () => void; start: () => void; cancel: () => void };
const Context = createContext<State | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [study, setStudy] = useState(initial);
  useEffect(() => {
    if (study.status !== 'processing') return;
    const timer = setInterval(() => setStudy((current) => {
      if (current.status !== 'processing') return current;
      const progress = Math.min(100, Math.round(current.progress + 100 / 6));
      return { ...current, progress, status: progress === 100 ? 'ready' : 'processing' };
    }), 1600);
    return () => clearInterval(timer);
  }, [study.status]);
  const update = (next: Partial<Study>) => setStudy((current) => ({ ...current, ...next }));
  const reset = () => setStudy(initial);
  const start = () => { update({ status: 'processing', progress: 0, reportStatus: 'Draft' }); };
  const cancel = () => update({ status: 'uploaded', progress: 0 });
  return <Context.Provider value={{ study, update, reset, start, cancel }}>{children}</Context.Provider>;
}

export function useUploadState() {
  const value = useContext(Context);
  if (!value) throw new Error('useUploadState must be used inside UploadProvider');
  return value;
}
