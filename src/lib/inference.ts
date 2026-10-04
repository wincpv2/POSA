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

type AnalysisStart = { runId: string; status: 'queued' | 'processing' | 'completed' };

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
  if (!response.ok) throw new Error(payload.detail || `Inference server returned ${response.status}.`);
  return payload;
}

export function startStudyAnalysis(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/analysis`, { method: 'POST' }) as Promise<AnalysisStart>;
}

export function getSignalMinute(uploadId: string, minute: number, mode: 'raw' | 'filtered' = 'raw') {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/signal?minute=${minute}&mode=${mode}`) as Promise<SignalMinute>;
}
