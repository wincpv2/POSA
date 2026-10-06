import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { getRecordTimelineCached, getSignalMinuteCached, startRecordSummary, startStudyAnalysis } from '@/lib/inference';
import { writeRecentUploadsCache, writeStudyReviewCache } from '@/lib/offline-cache';
import { getLatestPredictionRun, getStudyReport, listPredictionMinutes, listRecentEcgUploads, type PredictionRun } from '@/lib/queries';

export default function ProcessingScreen() {
  const { study, update, offlineDownload, retryOfflineDownload } = useUploadState();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(study.errorMessage);
  const [monitorError, setMonitorError] = useState('');
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [timelineState, setTimelineState] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const [signalState, setSignalState] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const missingRunSince = useRef<number | null>(null);
  const statusErrorSince = useRef<number | null>(null);
  const timelineRun = useRef('');
  const summaryRun = useRef('');
  const recentCacheRun = useRef('');
  const reviewCacheRun = useRef('');
  const userId = session?.user.id;

  const loadDetailData = useCallback((uploadId: string, runId: string) => {
    if (!userId) return;
    setSignalState('loading');
    setTimelineState('loading');
    getSignalMinuteCached(uploadId, 0, 'raw', runId, userId).then(() => setSignalState('ready')).catch(() => setSignalState('failed'));
    getRecordTimelineCached(uploadId, runId, userId).then(() => setTimelineState('ready')).catch(() => setTimelineState('failed'));
  }, [userId]);

  useEffect(() => {
    if (!study.uploadId) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const run = await getLatestPredictionRun(study.uploadId!);
        if (cancelled) return;
        if (!run) {
          statusErrorSince.current = null;
          missingRunSince.current ??= Date.now();
          if (Date.now() - missingRunSince.current >= 20_000) {
            setMonitorError('No analysis job is visible for this upload yet. Check the connection and retry if this message remains.');
          }
          if (Date.now() - missingRunSince.current >= 60_000) {
            const message = 'The inference worker did not create an analysis job. Check that the service is online, then retry.';
            setError(message);
            update({ status: 'failed', errorMessage: message });
          }
          return;
        }
        missingRunSince.current = null;
        statusErrorSince.current = null;
        setMonitorError('');
        setRun(run);
        update({
          runId: run.id,
          progress: run.progress_percent,
          durationSeconds: (run.total_minutes ?? 0) * 60,
          status: run.status === 'completed' ? 'ready' : run.status === 'failed' ? 'failed' : run.status,
          errorMessage: run.error_message ?? '',
        });
        setError(run.error_message ?? '');
        if (run.status === 'completed') {
          if (userId && reviewCacheRun.current !== run.id) {
            reviewCacheRun.current = run.id;
            void Promise.all([listPredictionMinutes(run.id), getStudyReport(study.uploadId!)]).then(([minutes, report]) =>
              writeStudyReviewCache(userId, study.uploadId!, { run, minutes, reportStatus: report.status }),
            ).catch(() => {});
          }
          if (userId && recentCacheRun.current !== run.id) {
            recentCacheRun.current = run.id;
            void listRecentEcgUploads(50).then((uploads) => writeRecentUploadsCache(userId, uploads)).catch(() => {});
          }
          if (timelineRun.current !== run.id) {
            timelineRun.current = run.id;
            loadDetailData(study.uploadId!, run.id);
          }
          if (run.summary_status === 'not_started' && summaryRun.current !== run.id) {
            summaryRun.current = run.id;
            void startRecordSummary(study.uploadId!).catch(() => { summaryRun.current = ''; });
          }
        }
      } catch (reason) {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : 'Could not read analysis status.';
        setMonitorError(`Status check failed: ${message}. Retrying automatically.`);
        statusErrorSince.current ??= Date.now();
        if (Date.now() - statusErrorSince.current >= 60_000) {
          const timeoutMessage = 'Could not reach the status database for 60 seconds. Check the connection, then retry analysis.';
          setError(timeoutMessage);
          update({ status: 'failed', errorMessage: timeoutMessage });
        }
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [study.uploadId, update, loadDetailData, userId]);

  const retry = async () => {
    if (!study.uploadId) return;
    setBusy(true);
    setError('');
    setMonitorError('');
    missingRunSince.current = null;
    statusErrorSince.current = null;
    try {
      const run = await startStudyAnalysis(study.uploadId);
      update({ runId: run.runId, status: run.status === 'completed' ? 'ready' : 'processing', progress: 0, errorMessage: '' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Inference server is unavailable.';
      setError(message);
      update({ status: 'failed', errorMessage: message });
    } finally {
      setBusy(false);
    }
  };

  const retrySummary = async () => {
    if (!study.uploadId || !run) return;
    try { await startRecordSummary(study.uploadId, true); } catch (reason) {
      setMonitorError(reason instanceof Error ? reason.message : 'Could not restart the ECG summary.');
    }
  };

  const prerequisiteLabel = (state: 'waiting' | 'loading' | 'ready' | 'failed') => state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'failed' ? 'unavailable' : 'waiting';

  const done = run?.status === 'completed' || study.status === 'ready';
  const processing = study.status === 'queued' || study.status === 'processing';
  const activeOfflineDownload = offlineDownload.uploadId === study.uploadId && offlineDownload.runId === run?.id;
  const offlineProgressPercent = offlineDownload.totalMinutes > 0
    ? Math.floor((offlineDownload.rawMinutes + offlineDownload.filteredMinutes) / (offlineDownload.totalMinutes * 2) * 100)
    : 0;
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY WORKFLOW" title={done ? 'Analysis complete' : processing ? 'Analyzing ECG recording' : 'Analysis needs attention'} description="The model classifies complete one-minute ECG windows. Progress and results come from the inference service." />
    <GlassPanel style={styles.panel}>
      <Text style={styles.heading}>{study.studyId} · {study.fileName}</Text>
      <Text style={styles.copy}>{study.sampleRate} Hz · {study.lead || 'First ECG channel'} · {study.fileSize ? `${(study.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}</Text>
      {processing ? <><View style={styles.progressRow}><ActivityIndicator color={colors.accent} /><Text style={styles.copy}>{study.status === 'queued' ? 'Waiting for the inference worker' : study.progress <= 1 ? 'Loading ECG recording' : study.progress <= 4 ? 'Preparing one-minute ECG windows' : study.progress >= 95 ? `Saving predictions · ${study.progress}%` : `Running model inference · ${study.progress}%`}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${study.progress}%` }]} /></View>{monitorError ? <Text accessibilityRole="alert" style={styles.error}>{monitorError}</Text> : null}</> : null}
      {done ? <Text style={styles.copy}>Predictions are saved and ready for clinician review.</Text> : null}
      {done ? <View style={styles.secondaryWork}>
        <Text style={styles.heading}>Full-night ECG summary</Text>
        {run?.summary_status === 'completed' ? <Text style={styles.copy}>Ready · HR, HRV, and report charts are available.</Text>
          : run?.summary_status === 'failed' ? <><Text accessibilityRole="alert" style={styles.error}>{run.summary_error_message || 'Full-night summary failed.'}</Text><AppButton compact variant="quiet" onPress={() => { void retrySummary(); }}><Text style={styles.link}>Retry summary</Text></AppButton></>
            : <><Text style={styles.copy}>{run?.summary_stage || 'Starting full-night summary'} · {run?.summary_progress_percent ?? 0}%</Text><View accessibilityRole="progressbar" accessibilityLabel="Full-night ECG summary progress" style={styles.track}><View style={[styles.fillSecondary, { width: `${run?.summary_progress_percent ?? 0}%` }]} /></View></>}
        <Text style={styles.copy}>ECG signal: {prerequisiteLabel(signalState)} · Python timeline: {prerequisiteLabel(timelineState)}</Text>
        {(signalState === 'failed' || timelineState === 'failed') && run?.id ? <AppButton compact variant="quiet" onPress={() => loadDetailData(study.uploadId!, run.id)}><Text style={styles.link}>Retry signal and timeline</Text></AppButton> : null}
        {activeOfflineDownload ? <View style={styles.offlineBlock}>
          <Text style={styles.heading}>Offline ECG download</Text>
          {offlineDownload.status === 'ready'
            ? <Text style={styles.copy}>Ready for offline playback · 100%</Text>
            : offlineDownload.status === 'failed'
              ? <><Text accessibilityRole="alert" style={styles.error}>Download stopped at {offlineProgressPercent}%: {offlineDownload.error}</Text><AppButton compact variant="quiet" onPress={retryOfflineDownload}><Text style={styles.link}>Resume download</Text></AppButton></>
              : <><Text style={styles.copy}>{offlineDownload.status === 'checking' ? 'Checking saved ECG' : `Saving ECG · ${offlineProgressPercent}%`} · Filtered {offlineDownload.filteredMinutes}/{offlineDownload.totalMinutes} min · Raw {offlineDownload.rawMinutes}/{offlineDownload.totalMinutes} min</Text><View accessibilityRole="progressbar" accessibilityLabel={`Offline ECG download ${offlineProgressPercent}%`} style={styles.track}><View style={[styles.fillSecondary, { width: `${offlineProgressPercent}%` }]} /></View></>}
        </View> : null}
      </View> : null}
      {!processing && !done ? <Text accessibilityRole="alert" style={styles.error}>{error || 'Analysis could not finish.'}</Text> : null}
    </GlassPanel>
    <View style={styles.actions}>
      {done ? <AppButton disabled={signalState === 'loading' || timelineState === 'loading' || signalState === 'waiting' || timelineState === 'waiting'} onPress={() => router.push('/detail')}><Text style={styles.primary}>Open ECG and predictions</Text></AppButton>
        : processing ? <AppButton variant="quiet" onPress={() => router.replace('/')}><Text style={styles.link}>Return home while analysis continues</Text></AppButton>
          : <AppButton onPress={() => { void retry(); }} disabled={busy}><Text style={styles.primary}>{busy ? 'Retrying…' : 'Retry analysis'}</Text></AppButton>}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.touch}><Text style={styles.link}>Back to home</Text></Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingTop: 24, paddingBottom: 56, gap: 18 },
  panel: { gap: 12 }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, secondaryWork: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }, offlineBlock: { gap: 8, marginTop: 4 },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  progressRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 10, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  fillSecondary: { height: '100%', backgroundColor: colors.cyan },
  error: { color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  primary: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
  link: { color: colors.text, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  touch: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
