import { supabase } from './supabase';
import {
  clearStaleStudyOfflineCache,
  readSignalCache,
  readTimelineCache,
  writeSignalCache,
  writeTimelineCache,
} from './offline-cache';

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
export type RecordTimeline = { uploadId: string; runId: string; durationSeconds: number; source: 'model_prediction'; svg: string };
export type SummaryJob = { runId: string; status: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed'; progressPercent: number; stage: string | null; error: string | null };

export type OfflineSignalProgress = {
  status: 'checking' | 'downloading' | 'ready';
  totalMinutes: number;
  rawMinutes: number;
  filteredMinutes: number;
};

const offlineDownloads = new Map<string, AbortController>();

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

export function getSignalMinute(uploadId: string, minute: number, mode: 'raw' | 'filtered' = 'raw', signal?: AbortSignal) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/signal?minute=${minute}&mode=${mode}`, { signal }) as Promise<SignalMinute>;
}

export function getRecordSummary(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/summary`).then((value) => {
    const summary = value as RecordSummary;
    const charts = summary?.charts?.screen;
    if (!charts?.heartRateSvg || !charts.hourlyApneaSvg || !charts.rrHistogramSvg) {
      throw new Error('The saved inference summary is missing its Python charts. Tap Retry summary to regenerate it.');
    }
    return summary;
  });
}

export function getRecordTimeline(uploadId: string) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/timeline`) as Promise<RecordTimeline>;
}

export async function getSignalMinuteCached(
  uploadId: string,
  minute: number,
  mode: 'raw' | 'filtered',
  runId: string,
  userId: string,
  options: { signal?: AbortSignal; requireCache?: boolean } = {},
) {
  try {
    const cached = await readSignalCache(userId, uploadId, runId, mode, minute);
    if (cached?.uploadId === uploadId && cached.minuteIndex === minute && cached.mode === mode) return cached;
  } catch { /* a damaged local segment is replaced from the inference service */ }

  if (options.signal?.aborted) throw new Error('ECG loading was cancelled.');
  const value = await getSignalMinute(uploadId, minute, mode, options.signal);
  if (value.uploadId !== uploadId || value.minuteIndex !== minute || value.mode !== mode) {
    throw new Error('The inference server returned the wrong ECG segment.');
  }
  if (options.signal?.aborted) throw new Error('ECG loading was cancelled.');
  try {
    await writeSignalCache(userId, runId, value);
  } catch (error) {
    if (options.requireCache) throw error;
  }
  return value;
}

export async function getRecordTimelineCached(uploadId: string, runId: string, userId: string) {
  try {
    const cached = await readTimelineCache(userId, uploadId, runId);
    if (cached?.uploadId === uploadId && cached.runId === runId && cached.svg) return cached;
  } catch { /* ignore a damaged local entry and rebuild it from the service */ }

  const value = await getRecordTimeline(uploadId);
  if (value.uploadId !== uploadId || (value.runId && value.runId !== runId)) {
    throw new Error('The analysis changed while its timeline was loading. Reopen the recording.');
  }
  const timeline = { ...value, runId: value.runId || runId };
  try { await writeTimelineCache(userId, timeline); } catch { /* online viewing still works if local storage is full */ }
  return timeline;
}

function offlineDownloadKey(userId: string, uploadId: string, runId: string) {
  return `${userId}:${uploadId}:${runId}`;
}

export function cancelOfflineSignalDownloads(userId: string, uploadId?: string) {
  for (const [key, controller] of offlineDownloads) {
    if (key.startsWith(`${userId}:`) && (!uploadId || key.startsWith(`${userId}:${uploadId}:`))) controller.abort();
  }
}

export async function downloadStudySignalsOffline(
  userId: string,
  uploadId: string,
  runId: string,
  totalMinutes: number,
  onProgress: (progress: OfflineSignalProgress) => void,
  signal?: AbortSignal,
) {
  const identity = offlineDownloadKey(userId, uploadId, runId);
  const previous = offlineDownloads.get(identity);
  previous?.abort();
  const controller = new AbortController();
  offlineDownloads.set(identity, controller);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });

  const count = Math.max(0, Math.ceil(totalMinutes));
  let rawMinutes = 0;
  let filteredMinutes = 0;
  let firstError: unknown;
  try {
    onProgress({ status: 'checking', totalMinutes: count, rawMinutes, filteredMinutes });
    await clearStaleStudyOfflineCache(userId, uploadId, runId);
    onProgress({ status: 'downloading', totalMinutes: count, rawMinutes, filteredMinutes });
    const tasks = (['filtered', 'raw'] as const).flatMap((mode) =>
      Array.from({ length: count }, (_, minute) => ({ mode, minute })),
    );
    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        if (controller.signal.aborted) throw firstError ?? new Error('Offline ECG download was interrupted.');
        const task = tasks[next++];
        try {
          await getSignalMinuteCached(uploadId, task.minute, task.mode, runId, userId, {
            signal: controller.signal,
            requireCache: true,
          });
        } catch (error) {
          firstError ??= error;
          controller.abort();
          throw error;
        }
        if (task.mode === 'raw') rawMinutes += 1;
        else filteredMinutes += 1;
        onProgress({ status: 'downloading', totalMinutes: count, rawMinutes, filteredMinutes });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()));
    onProgress({ status: 'ready', totalMinutes: count, rawMinutes: count, filteredMinutes: count });
  } finally {
    signal?.removeEventListener('abort', abort);
    if (offlineDownloads.get(identity) === controller) offlineDownloads.delete(identity);
  }
}

export function startRecordSummary(uploadId: string, refresh = false) {
  return request(`/v1/studies/${encodeURIComponent(uploadId)}/summary${refresh ? '?refresh=true' : ''}`, { method: 'POST' }) as Promise<SummaryJob>;
}
