import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';
import { startStudyAnalysis } from '@/lib/inference';
import { getLatestPredictionRun } from '@/lib/queries';

export default function ProcessingScreen() {
  const { study, update } = useUploadState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(study.errorMessage);
  const [monitorError, setMonitorError] = useState('');
  const missingRunSince = useRef<number | null>(null);
  const statusErrorSince = useRef<number | null>(null);

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
        update({
          runId: run.id,
          progress: run.progress_percent,
          durationSeconds: (run.total_minutes ?? 0) * 60,
          status: run.status === 'completed' ? 'ready' : run.status === 'failed' ? 'failed' : run.status,
          errorMessage: run.error_message ?? '',
        });
        setError(run.error_message ?? '');
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
  }, [study.uploadId, update]);

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

  const done = study.status === 'ready';
  const processing = study.status === 'queued' || study.status === 'processing';
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY WORKFLOW" title={done ? 'Analysis complete' : processing ? 'Analyzing ECG recording' : 'Analysis needs attention'} description="The model classifies complete one-minute ECG windows. Progress and results come from the inference service." />
    <GlassPanel style={styles.panel}>
      <Text style={styles.heading}>{study.studyId} · {study.fileName}</Text>
      <Text style={styles.copy}>{study.sampleRate} Hz · {study.lead || 'First ECG channel'} · {study.fileSize ? `${(study.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}</Text>
      {processing ? <><View style={styles.progressRow}><ActivityIndicator color={colors.accent} /><Text style={styles.copy}>{study.status === 'queued' ? 'Waiting for the inference worker' : study.progress <= 1 ? 'Loading ECG recording' : study.progress <= 4 ? 'Preparing one-minute ECG windows' : study.progress >= 95 ? `Saving predictions · ${study.progress}%` : `Running model inference · ${study.progress}%`}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${study.progress}%` }]} /></View>{monitorError ? <Text accessibilityRole="alert" style={styles.error}>{monitorError}</Text> : null}</> : null}
      {done ? <Text style={styles.copy}>Predictions are saved and ready for clinician review.</Text> : null}
      {!processing && !done ? <Text accessibilityRole="alert" style={styles.error}>{error || 'Analysis could not finish.'}</Text> : null}
    </GlassPanel>
    <View style={styles.actions}>
      {done ? <AppButton onPress={() => router.push('/detail')}><Text style={styles.primary}>Open ECG and predictions</Text></AppButton>
        : processing ? <AppButton variant="quiet" onPress={() => router.replace('/')}><Text style={styles.link}>Return home while analysis continues</Text></AppButton>
          : <AppButton onPress={() => { void retry(); }} disabled={busy}><Text style={styles.primary}>{busy ? 'Retrying…' : 'Retry analysis'}</Text></AppButton>}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.touch}><Text style={styles.link}>Back to home</Text></Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingTop: 24, paddingBottom: 56, gap: 18 },
  panel: { gap: 12 }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  progressRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 10, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  error: { color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  primary: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
  link: { color: colors.text, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  touch: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
