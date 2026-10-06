import { supabase } from './supabase';

export type SignalMinute = {
  uploadId: string;
  minuteIndex: number;
  samplingRateHz: number;
  lead: string;
  unit: string;
  mode: 'raw' | 'filtered';
  rPeakSource: 'qrs_annotation' | 'xqrs';
  samples: number[];
  rPeakSamples: number[];
  estimatedBpm: number | null;
  apneaAnnotationsAvailable: boolean;
  apneaIntervals: { startSeconds: number; endSeconds: number }[];
};

export type RecordSummary = {
  uploadId: string;
  durationSeconds: number;
  samplingRateHz: number;
  lead: string;
  unit: string;
  rPeakSource: 'qrs_annotation' | 'xqrs';
  qrsAnnotationsAvailable: boolean;
  apneaAnnotationsAvailable: boolean;
  labelledMinutes: number | null;
  apneaLabelMinutes: number | null;
  apneaIntervals: { startSeconds: number; endSeconds: number }[];
  medianHrBpm: number | null;
  sdnnMs: number | null;
  rmssdMs: number | null;
  hrvSource: 'normal_beat_qrs' | 'automatic_xqrs_estimate';
  validRrPercent: number | null;
  heartRateByMinute: { minuteIndex: number; medianBpm: number }[];
  rrHistogram: { edgesSeconds: number[]; counts: number[] };
  charts: {
    screen: { fullNightOverviewSvg: string; modelPredictionSvg?: string; heartRateSvg: string; hourlyApneaSvg: string; rrHistogramSvg: string };
    print: { fullNightOverviewSvg: string; modelPredictionSvg?: string; heartRateSvg: string; hourlyApneaSvg: string; rrHistogramSvg: string };
  };
  modelMetrics: {
    runId: string | null;
    analysedMinutes: number;
    probabilityWeightedApneaMinutes: number | null;
    probabilityWeightedApneaSharePercent: number | null;
    thresholdApneaMinutes: number | null;
    thresholdApneaSharePercent: number | null;
    predictedRuns: number | null;
    threshold: number;
  };
};

type AnalysisStart = { runId: string; status: 'queued' | 'processing' | 'completed' };
export type RecordTimeline = { uploadId: string; durationSeconds: number; source: 'model_prediction'; svg: string };
export type SummaryJob = { runId: string; status: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed'; progressPercent: number; stage: string | null; error: string | null };

function apiUrl() {
  const value = process.env.EXPO_PUBLIC_INFERENCE_API_URL;
  if (!value) throw new Error('Set EXPO_PUBLIC_INFERENCE_API_URL to the local inference server URL.');
  return value.replace(/\/$/, '');
}

async function request(path: string, init: RequestInit = {}) {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Sign in again before starting analysis.');
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : '';
    if (response.status === 404 && detail === 'Not Found' && path.endsWith('/summary')) {
      throw new Error('The local inference server is out of date. Restart it to load the recording summary endpoint.');
    }
    throw new Error(detail || `Inference server returned ${response.status}.`);
  }
  return payload;
}

export function startStudyAnalysis(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/analysis`, { method: 'POST' }) as Promise<AnalysisStart>;
}

export function getSignalMinute(uploadId: string, minute: number, mode: 'raw' | 'filtered' = 'raw') {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/signal?minute=${minute}&mode=${mode}`) as Promise<SignalMinute>;
}

export function getRecordSummary(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/summary`) as Promise<RecordSummary>;
}

export function getRecordTimeline(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/timeline`) as Promise<RecordTimeline>;
}

export function startRecordSummary(uploadId: string, refresh = false) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/summary${refresh ? '?refresh=true' : ''}`, { method: 'POST' }) as Promise<SummaryJob>;
}
