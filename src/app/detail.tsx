import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppButton, DetailsDisclosure, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { EcgWaveform, RecordingOverview } from '@/components/ecg-monitor';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { getRecordSummary, getSignalMinute, type RecordSummary, type SignalMinute } from '@/lib/inference';
import { addSymptomEvent, deleteSymptomEvent, getEcgUploadOwner, getLatestPredictionRun, getStudyReport, listPredictionMinutes, listSymptomEvents, SYMPTOM_TAGS, uploadEcgAnnotations, type EcgSymptomEvent, type PredictionMinute, type PredictionRun, type SymptomTag } from '@/lib/queries';

const SPEEDS = [1, 5, 20] as const;
const ZOOM_WINDOWS = [2.5, 5, 10, 20, 40, 80];
const timeLabel = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function predictionIntervals(minutes: PredictionMinute[], duration: number) {
  const positive = minutes.filter((item) => item.is_apnea).map((item) => item.minute_index).sort((a, b) => a - b);
  const intervals: { startSeconds: number; endSeconds: number }[] = [];
  for (const minute of positive) {
    const previous = intervals[intervals.length - 1];
    if (previous && minute * 60 <= previous.endSeconds) previous.endSeconds = Math.min(duration, (minute + 1) * 60);
    else intervals.push({ startSeconds: minute * 60, endSeconds: Math.min(duration, (minute + 1) * 60) });
  }
  return intervals;
}

export default function DetailScreen() {
  const { width, height } = useWindowDimensions();
  // The side-by-side review layout needs enough vertical room for a complete
  // ECG panel. Short desktop windows use the scrollable responsive layout.
  const desktop = width >= 1100 && height >= 1050;
  const { study, update } = useUploadState();
  const { session } = useAuth();
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [minutes, setMinutes] = useState<PredictionMinute[]>([]);
  const [events, setEvents] = useState<EcgSymptomEvent[]>([]);
  const [signal, setSignal] = useState<SignalMinute | null>(null);
  const [recordSummary, setRecordSummary] = useState<RecordSummary | null>(null);
  const [summaryFetch, setSummaryFetch] = useState<{ key: string; error: string }>({ key: '', error: '' });
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [intervalsOpen, setIntervalsOpen] = useState(true);
  const [annotationOwner, setAnnotationOwner] = useState(false);
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [annotationError, setAnnotationError] = useState('');
  const [annotationMessage, setAnnotationMessage] = useState('');
  const [selectedPeak, setSelectedPeak] = useState<{ minute: number; index: number } | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [viewStartSec, setViewStartSec] = useState(0);
  const [viewSeconds, setViewSeconds] = useState(5);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [signalMode, setSignalMode] = useState<'raw' | 'filtered'>('filtered');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signalError, setSignalError] = useState('');
  const [signalErrorKey, setSignalErrorKey] = useState('');
  const [eventError, setEventError] = useState('');
  const [reportLocked, setReportLocked] = useState(false);
  const [symptomModal, setSymptomModal] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomTag[]>([]);
  const [eventBusy, setEventBusy] = useState(false);
  const [signalRetry, setSignalRetry] = useState(0);
  const playheadRef = useRef(0);
  const speedRef = useRef(speed);
  const viewSecondsRef = useRef(viewSeconds);
  const viewStartRef = useRef(viewStartSec);
  const eventsRevisionRef = useRef(0);

  const inferredDuration = (run?.total_minutes ?? minutes.length) * 60;
  const reportedDuration = Number.isFinite(study.durationSeconds) && study.durationSeconds > 0 ? study.durationSeconds : inferredDuration;
  const totalDuration = Number.isFinite(reportedDuration) && reportedDuration > 0
    ? reportedDuration
    : Number.isFinite(inferredDuration) && inferredDuration > 0 ? inferredDuration : 1;
  const safePlayheadSec = Number.isFinite(playheadSec) ? clamp(playheadSec, 0, totalDuration) : 0;
  const currentMinute = Math.min(Math.floor(safePlayheadSec / 60), Math.max(0, Math.ceil(totalDuration / 60) - 1));
  const currentSecond = safePlayheadSec - currentMinute * 60;
  const signalKey = `${study.uploadId ?? ''}:${currentMinute}:${signalMode}:${signalRetry}`;
  const summaryKey = `${study.uploadId ?? ''}:${run?.id ?? ''}:${summaryRetry}`;
  const summaryError = summaryFetch.key === summaryKey ? summaryFetch.error : '';
  const currentSignal = signal?.uploadId === study.uploadId && signal.minuteIndex === currentMinute && signal.mode === signalMode ? signal : null;
  const currentRecordSummary = recordSummary?.uploadId === study.uploadId && (run?.status !== 'completed' || recordSummary.modelMetrics.runId === run.id) ? recordSummary : null;
  const currentEvents = events.filter((event) => event.ecg_upload_id === study.uploadId);
  const currentPrediction = minutes.find((item) => item.minute_index === currentMinute);
  const predictedApneaIntervals = useMemo(() => predictionIntervals(minutes, totalDuration), [minutes, totalDuration]);
  const annotationsAvailable = currentRecordSummary?.apneaAnnotationsAvailable ?? currentSignal?.apneaAnnotationsAvailable ?? false;
  const apneaIntervals = currentRecordSummary?.apneaAnnotationsAvailable
    ? currentRecordSummary.apneaIntervals
    : currentSignal?.apneaAnnotationsAvailable ? currentSignal.apneaIntervals : predictedApneaIntervals;
  const apneaMinutes = run?.apnea_minutes ?? minutes.filter((item) => item.is_apnea).length;
  const apneaPercent = run?.apnea_percent ?? (minutes.length ? apneaMinutes * 100 / minutes.length : 0);
  const signalPending = run?.status === 'completed'
    && (!signal || signal.uploadId !== study.uploadId || signal.minuteIndex !== currentMinute || signal.mode !== signalMode)
    && signalErrorKey !== signalKey;

  useEffect(() => { playheadRef.current = playheadSec; }, [playheadSec]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { viewSecondsRef.current = viewSeconds; }, [viewSeconds]);
  useEffect(() => { viewStartRef.current = viewStartSec; }, [viewStartSec]);

  useEffect(() => {
    if (!study.uploadId) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    async function loadStudy() {
      try {
        const [latest, savedReport] = await Promise.all([
          getLatestPredictionRun(study.uploadId!),
          getStudyReport(study.uploadId!),
        ]);
        const rows = latest?.status === 'completed' ? await listPredictionMinutes(latest.id) : [];
        if (cancelled) return;
        setRun(latest);
        setMinutes(rows);
        setReportLocked(savedReport.status === 'Approved');
        update({ reportStatus: savedReport.status });
        setLoading(false);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Could not load study results.');
          setLoading(false);
        }
      }
    }
    void loadStudy();
    return () => { cancelled = true; };
  }, [study.uploadId, update]);

  useEffect(() => {
    if (!study.uploadId || !session?.user.id) return;
    let cancelled = false;
    getEcgUploadOwner(study.uploadId)
      .then((owner) => { if (!cancelled) setAnnotationOwner(owner === session.user.id); })
      .catch(() => { if (!cancelled) setAnnotationOwner(false); });
    return () => { cancelled = true; };
  }, [study.uploadId, session?.user.id]);

  useEffect(() => {
    if (!study.uploadId) return;
    let cancelled = false;
    const revision = eventsRevisionRef.current;
    listSymptomEvents(study.uploadId)
      .then((saved) => { if (!cancelled && eventsRevisionRef.current === revision) { setEvents(saved); setEventError(''); } })
      .catch((reason) => { if (!cancelled) setEventError(reason instanceof Error ? reason.message : 'Could not load symptom events.'); });
    return () => { cancelled = true; };
  }, [study.uploadId]);

  useEffect(() => {
    if (!study.uploadId || run?.status !== 'completed') return;
    let cancelled = false;
    getSignalMinute(study.uploadId, currentMinute, signalMode)
      .then((value) => { if (!cancelled) { setSignal(value); setSignalError(''); setSignalErrorKey(''); } })
      .catch((reason) => { if (!cancelled) { setSignalError(reason instanceof Error ? reason.message : 'Could not load the ECG signal.'); setSignalErrorKey(signalKey); } });
    return () => { cancelled = true; };
  }, [study.uploadId, currentMinute, signalMode, signalKey, signalRetry, run?.status]);

  useEffect(() => {
    if (!study.uploadId || run?.status !== 'completed') return;
    let cancelled = false;
    getRecordSummary(study.uploadId)
      .then((value) => { if (!cancelled) { setRecordSummary(value); setSummaryFetch({ key: summaryKey, error: '' }); } })
      .catch((reason) => { if (!cancelled) setSummaryFetch({ key: summaryKey, error: reason instanceof Error ? reason.message : 'Could not load recording summary.' }); });
    return () => { cancelled = true; };
  }, [study.uploadId, run?.status, summaryKey]);

  useEffect(() => {
    if (!playing) return;
    let lastTick = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = Math.min((now - lastTick) / 1000, 0.5);
      lastTick = now;
      const next = Math.min(totalDuration, playheadRef.current + delta * speedRef.current);
      playheadRef.current = next;
      setPlayheadSec(next);
      if (next >= totalDuration) setPlaying(false);
    }, 100);
    return () => clearInterval(timer);
  }, [playing, totalDuration]);

  const jumpTo = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const next = clamp(seconds, 0, Math.max(0, totalDuration - 0.001));
    playheadRef.current = next;
    setPlayheadSec(next);
    setPlaying(false);
    const local = next % 60;
    const span = Math.min(viewSecondsRef.current, 60);
    setViewStartSec(clamp(local - span / 2, 0, Math.max(0, 60 - span)));
  }, [totalDuration]);

  const togglePlay = () => {
    if (safePlayheadSec >= totalDuration - 0.01) jumpTo(0);
    setPlaying((value) => !value);
  };

  const changeZoom = (direction: -1 | 1) => {
    const index = ZOOM_WINDOWS.indexOf(viewSeconds);
    const next = ZOOM_WINDOWS[clamp(index + direction, 0, ZOOM_WINDOWS.length - 1)];
    const anchor = currentSecond;
    const signalDuration = currentSignal && Number.isFinite(currentSignal.samplingRateHz) && currentSignal.samplingRateHz > 0
      ? currentSignal.samples.length / currentSignal.samplingRateHz
      : 60;
    const duration = Number.isFinite(signalDuration) && signalDuration > 0 ? signalDuration : 60;
    const oldSpan = Math.min(viewSeconds, duration);
    const ratio = oldSpan > 0 ? clamp((anchor - viewStartSec) / oldSpan, 0, 1) : 0.5;
    const span = Math.min(next, duration);
    setViewSeconds(next);
    setViewStartSec(clamp(anchor - ratio * span, 0, Math.max(0, duration - span)));
    setPlaying(false);
  };

  const seekInWaveform = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const next = clamp(seconds, 0, Math.max(0, totalDuration - 0.001));
    playheadRef.current = next;
    setPlayheadSec(next);
    setPlaying(false);
    const local = next % 60;
    if (local < viewStartRef.current || local > viewStartRef.current + viewSecondsRef.current) {
      setViewStartSec(clamp(local - viewSecondsRef.current / 2, 0, Math.max(0, 60 - viewSecondsRef.current)));
    }
  }, [totalDuration]);

  const moveToApnea = (direction: -1 | 1) => {
    const targets = apneaIntervals.map((interval) => interval.startSeconds).filter(Number.isFinite).sort((a, b) => a - b);
    const target = direction > 0
      ? targets.find((seconds) => seconds > safePlayheadSec)
      : [...targets].reverse().find((seconds) => seconds < safePlayheadSec);
    if (target !== undefined) jumpTo(target);
  };

  const attachAnnotations = async () => {
    if (!study.uploadId || !annotationOwner) return;
    setAnnotationBusy(true);
    setAnnotationError('');
    setAnnotationMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' ? ['.qrs', '.apn'] : ['application/octet-stream'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const files = result.assets;
      if (!files.length || files.length > 2 || files.some((file) => !/\.(qrs|apn)$/i.test(file.name))) {
        throw new Error('Choose one matching .qrs file, one matching .apn file, or both.');
      }
      const extensions = files.map((file) => file.name.split('.').pop()?.toLowerCase());
      if (new Set(extensions).size !== extensions.length) throw new Error('Choose at most one file of each annotation type.');
      await uploadEcgAnnotations(study.uploadId, files.map((file) => ({ uri: file.uri, name: file.name, mimeType: file.mimeType })));
      setSignalRetry((value) => value + 1);
      setSelectedPeak(null);
      setAnnotationMessage('Annotations attached. Reference peaks and intervals are loading.');
    } catch (reason) {
      setSignalRetry((value) => value + 1);
      const message = typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : '';
      setAnnotationError(message || (reason instanceof Error ? reason.message : 'Could not attach annotation files.'));
    } finally {
      setAnnotationBusy(false);
    }
  };

  const saveSymptoms = async () => {
    if (!study.uploadId || !selectedSymptoms.length) return;
    setEventBusy(true);
    setEventError('');
    try {
      const created = await addSymptomEvent(study.uploadId, safePlayheadSec, selectedSymptoms);
      eventsRevisionRef.current += 1;
      setEvents((current) => [...current, created].sort((a, b) => a.occurred_at_seconds - b.occurred_at_seconds));
      setSymptomModal(false);
      setSelectedSymptoms([]);
    } catch (reason) {
      setEventError(reason instanceof Error ? reason.message : 'Could not save the symptom event.');
    } finally {
      setEventBusy(false);
    }
  };

  const removeSymptom = async (eventId: string) => {
    setEventBusy(true);
    setEventError('');
    try {
      await deleteSymptomEvent(eventId);
      eventsRevisionRef.current += 1;
      setEvents((current) => current.filter((event) => event.id !== eventId));
    } catch (reason) {
      setEventError(reason instanceof Error ? reason.message : 'Could not delete the symptom event.');
    } finally {
      setEventBusy(false);
    }
  };

  if (!study.uploadId || study.status !== 'ready') return <View style={styles.gate}><Text style={styles.title}>No completed analysis selected</Text><Text style={styles.copy}>Choose a completed study from Home.</Text><AppButton href="/"><Text style={styles.buttonText}>Go to Home</Text></AppButton></View>;

  const hasPreviousApnea = apneaIntervals.some((interval) => Number.isFinite(interval.startSeconds) && interval.startSeconds < safePlayheadSec);
  const hasNextApnea = apneaIntervals.some((interval) => Number.isFinite(interval.startSeconds) && interval.startSeconds > safePlayheadSec);

  return <ScrollView scrollEnabled={!desktop} style={[styles.scroll, desktop && styles.desktopScroll]} contentContainerStyle={[styles.page, desktop && styles.pageDesktop]}>
    {desktop ? <View style={styles.desktopHeader}><Text style={styles.chartHint}>ECG MONITOR · STUDY REVIEW</Text><Text style={styles.desktopTitle}>{study.studyId || 'Study'}</Text><Text style={styles.chartHint}>{study.sampleRate || 100} Hz · {study.lead || 'first ECG channel'} · {study.fileName || ''}</Text></View> : <PageIntro eyebrow="ECG MONITOR · STUDY REVIEW" title={study.studyId || 'Study'} description={`${study.sampleRate || 100} Hz · ${study.lead || 'first ECG channel'} · ${study.fileName || ''}`} />}
    {loading ? <GlassPanel style={styles.panel}><ActivityIndicator color={colors.accent} /></GlassPanel> : null}
    {error ? <GlassPanel style={styles.panel}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></GlassPanel> : null}
    {run?.status === 'completed' ? <>
      <View style={[styles.studyGrid, desktop && styles.studyGridDesktop]}>
      <View style={[styles.monitorColumn, desktop && styles.monitorColumnDesktop]}>
      {desktop ? <View style={styles.compactStats}><Text style={styles.chartHint}>Model apnea: {apneaMinutes} / {run.total_minutes ?? minutes.length} min · {apneaPercent.toFixed(1)}%</Text><Text style={styles.chartHint}>Estimated HR: {currentSignal?.estimatedBpm == null ? '— BPM' : `~${currentSignal.estimatedBpm} BPM`}</Text></View> : <View style={styles.stats}>
        <Stat label="Predicted apnea minutes" value={`${apneaMinutes} / ${run.total_minutes ?? minutes.length}`} sub="Independent minute classifications" />
        <Stat label="Predicted apnea proportion" value={`${apneaPercent.toFixed(1)}%`} sub="Apnea-classified ÷ analyzed minutes" />
        <Stat label="Estimated heart rate" value={currentSignal?.estimatedBpm == null ? '— BPM' : `~${currentSignal.estimatedBpm} BPM`} sub="Approximate · derived from detected beats" />
      </View>}

      <GlassPanel style={[styles.monitorPanel, desktop && styles.monitorPanelDesktop]}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.heading}>ECG monitor</Text>
            <Text style={styles.copy}>{currentSignal?.lead || study.lead || 'ECG'} · {currentSignal?.unit || 'unit unavailable'} · {currentSignal?.samplingRateHz ?? study.sampleRate ?? 100} Hz</Text>
          </View>
          <View style={[styles.statusBadge, currentPrediction?.is_apnea ? styles.apneaBadge : styles.normalBadge]}>
            <Text style={styles.statusText}>{currentPrediction ? currentPrediction.is_apnea ? 'MODEL · APNEA' : 'MODEL · NON-APNEA' : 'UNCLASSIFIED MINUTE'}</Text>
          </View>
        </View>
        <View style={styles.controls}>
          <AppButton compact onPress={togglePlay}><Text style={styles.buttonText}>{playing ? 'Pause' : 'Play'}</Text></AppButton>
          <Text style={styles.controlLabel}>Speed</Text>
          {SPEEDS.map((value) => <ToolButton key={value} selected={speed === value} onPress={() => setSpeed(value)}>{`${value}×`}</ToolButton>)}
          <View style={styles.controlDivider} />
          <ToolButton selected={signalMode === 'filtered'} onPress={() => setSignalMode('filtered')}>Filtered</ToolButton>
          <ToolButton selected={signalMode === 'raw'} onPress={() => setSignalMode('raw')}>Raw</ToolButton>
        </View>
        <View style={styles.zoomRow}>
          <Text style={styles.controlLabel}>Window</Text>
          <AppButton compact variant="quiet" disabled={viewSeconds === ZOOM_WINDOWS[0]} onPress={() => changeZoom(-1)}><Text style={styles.link}>Zoom in −</Text></AppButton>
          <Text style={styles.copy}>{viewSeconds}s</Text>
          <AppButton compact variant="quiet" disabled={viewSeconds === ZOOM_WINDOWS[ZOOM_WINDOWS.length - 1]} onPress={() => changeZoom(1)}><Text style={styles.link}>Zoom out +</Text></AppButton>
          <Text style={styles.playhead}>{timeLabel(safePlayheadSec)} / {timeLabel(totalDuration)}</Text>
        </View>
        <EcgWaveform
          signal={currentSignal}
          signalPending={signalPending}
          signalError={signalError}
          chartFlex={desktop}
          onRetry={() => setSignalRetry((value) => value + 1)}
          currentMinute={currentMinute}
          currentSecond={currentSecond}
          totalDuration={totalDuration}
          viewStartSec={viewStartSec}
          viewSeconds={viewSeconds}
          playing={playing}
          apneaIntervals={apneaIntervals}
          events={events}
          uploadId={study.uploadId}
          selectedPeak={selectedPeak}
          onSelectedPeak={setSelectedPeak}
          onViewStart={setViewStartSec}
          onViewSeconds={setViewSeconds}
          onPlaying={setPlaying}
          onSeek={seekInWaveform}
        />
        {selectedPeak && selectedPeak.minute === currentMinute && currentSignal && Number.isFinite(currentSignal.samplingRateHz) && currentSignal.samplingRateHz > 0 ? <Text style={styles.rrReadout}>
          Previous R–R: {selectedPeak.index > 0 ? `${((currentSignal.rPeakSamples[selectedPeak.index] - currentSignal.rPeakSamples[selectedPeak.index - 1]) * 1000 / currentSignal.samplingRateHz).toFixed(0)} ms` : '—'} · Next R–R: {selectedPeak.index + 1 < currentSignal.rPeakSamples.length ? `${((currentSignal.rPeakSamples[selectedPeak.index + 1] - currentSignal.rPeakSamples[selectedPeak.index]) * 1000 / currentSignal.samplingRateHz).toFixed(0)} ms` : '—'}
        </Text> : null}
        <View style={styles.minuteControls}>
          <AppButton compact variant="quiet" disabled={!hasPreviousApnea} onPress={() => moveToApnea(-1)}><Text style={styles.link}>Previous apnea</Text></AppButton>
          <AppButton compact variant="quiet" disabled={!hasNextApnea} onPress={() => moveToApnea(1)}><Text style={styles.link}>Next apnea</Text></AppButton>
        </View>
      </GlassPanel>

      <GlassPanel style={[styles.panel, desktop && styles.overviewPanelDesktop]}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}><Text style={styles.heading}>Recording overview</Text><Text style={styles.copy}>Full recording · click or tap to seek · {annotationsAvailable ? 'red = WFDB A annotations' : 'red = model predictions'}</Text></View>
          <View style={styles.headingActions}>
            {annotationOwner && !reportLocked ? <AppButton compact variant="quiet" disabled={annotationBusy} onPress={() => { void attachAnnotations(); }}><Text style={styles.link}>{annotationBusy ? 'Attaching…' : 'Add WFDB annotations'}</Text></AppButton> : null}
            <AppButton compact disabled={reportLocked} onPress={() => { setEventError(''); setSelectedSymptoms([]); setSymptomModal(true); }}><Text style={styles.buttonText}>＋ Add symptom</Text></AppButton>
          </View>
        </View>
        <RecordingOverview
          duration={totalDuration}
          playheadSec={safePlayheadSec}
          viewStartSec={currentMinute * 60 + viewStartSec}
          viewSeconds={viewSeconds}
          timelineHeight={desktop ? 88 : undefined}
          overviewSvg={currentRecordSummary?.charts.screen.fullNightOverviewSvg}
          loading={run?.status === 'completed' && !currentRecordSummary && !summaryError}
          onSeek={jumpTo}
        />
        {annotationMessage ? <Text style={styles.chartHint}>{annotationMessage}</Text> : null}
        {annotationError ? <Text accessibilityRole="alert" style={styles.error}>{annotationError}</Text> : null}
        {currentEvents.length > 0 && desktop ? <DetailsDisclosure title={`Symptom events (${currentEvents.length})`}>
          <ScrollView style={styles.eventListDesktop} nestedScrollEnabled>{currentEvents.map((event) => <View key={event.id} style={styles.eventRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Seek to ${timeLabel(event.occurred_at_seconds)}: ${event.symptoms.join(', ')}`} onPress={() => jumpTo(event.occurred_at_seconds)} style={styles.eventContent}>
              <Text style={styles.eventTime}>{timeLabel(event.occurred_at_seconds)}</Text><Text style={styles.copy}>{event.symptoms.join(' · ')}</Text>
            </Pressable>
            {!reportLocked && event.created_by === session?.user?.id ? <AppButton compact variant="quiet" disabled={eventBusy} onPress={() => { void removeSymptom(event.id); }}><Text style={styles.deleteText}>Remove</Text></AppButton> : null}
          </View>)}</ScrollView>
        </DetailsDisclosure> : currentEvents.length > 0 ? <ScrollView style={styles.eventList} nestedScrollEnabled>
          <Text style={styles.subheading}>Symptom events</Text>
          {currentEvents.map((event) => <View key={event.id} style={styles.eventRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Seek to ${timeLabel(event.occurred_at_seconds)}: ${event.symptoms.join(', ')}`} onPress={() => jumpTo(event.occurred_at_seconds)} style={styles.eventContent}>
              <Text style={styles.eventTime}>{timeLabel(event.occurred_at_seconds)}</Text><Text style={styles.copy}>{event.symptoms.join(' · ')}</Text>
            </Pressable>
            {!reportLocked && event.created_by === session?.user?.id ? <AppButton compact variant="quiet" disabled={eventBusy} onPress={() => { void removeSymptom(event.id); }}><Text style={styles.deleteText}>Remove</Text></AppButton> : null}
          </View>)}
        </ScrollView> : <Text style={styles.copy}>No symptom events recorded.</Text>}
        {eventError ? <Text accessibilityRole="alert" style={styles.error}>{eventError}</Text> : null}
        {reportLocked ? <Text style={styles.chartHint}>This symptom log is locked with the approved report.</Text> : null}
      </GlassPanel>
      </View>
      <GlassPanel style={[styles.intervalPanel, desktop && (intervalsOpen ? styles.intervalPanelDesktop : styles.intervalPanelCollapsed)]}>
        {desktop && !intervalsOpen ? <Pressable accessibilityRole="button" accessibilityLabel="Show apnea intervals" onPress={() => setIntervalsOpen(true)} style={styles.collapsedIntervalsButton}><Text style={styles.intervalToggle}>Show</Text></Pressable> : <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: intervalsOpen }} onPress={() => setIntervalsOpen((open) => !open)} style={styles.intervalHeader}>
            <View style={styles.headingCopy}>
              <Text style={styles.heading}>Apnea intervals</Text>
              <Text style={styles.chartHint}>{annotationsAvailable ? 'WFDB annotation runs' : 'Model-predicted minute runs'} · {apneaIntervals.length} intervals</Text>
            </View>
            <Text style={styles.intervalToggle}>{intervalsOpen ? 'Hide' : 'Show'}</Text>
          </Pressable>
          {intervalsOpen ? <>
            {summaryError ? <View style={styles.summaryError}><Text style={styles.chartHint}>{summaryError}</Text><AppButton compact variant="quiet" onPress={() => setSummaryRetry((value) => value + 1)}><Text style={styles.link}>Retry</Text></AppButton></View> : null}
            <View style={styles.intervalColumns}><Text style={styles.intervalIndex}>#</Text><Text style={styles.intervalTime}>Start</Text><Text style={styles.intervalTime}>End</Text><Text style={styles.intervalDuration}>min</Text></View>
            <ScrollView style={[styles.intervalList, desktop && styles.intervalListDesktop]} nestedScrollEnabled>
              {apneaIntervals.map((interval, index) => <Pressable key={`${annotationsAvailable ? 'ann' : 'model'}-${index}`} accessibilityRole="button" onPress={() => jumpTo(interval.startSeconds)} style={styles.intervalRow}>
                <Text style={styles.intervalIndex}>{index + 1}</Text><Text style={styles.intervalTime}>{timeLabel(interval.startSeconds)}</Text><Text style={styles.intervalTime}>{timeLabel(interval.endSeconds)}</Text><Text style={styles.intervalDuration}>{((interval.endSeconds - interval.startSeconds) / 60).toFixed(0)}</Text>
              </Pressable>)}
              {!apneaIntervals.length ? <Text style={styles.chartHint}>No apnea intervals are available.</Text> : null}
            </ScrollView>
          </> : null}
        </>}
      </GlassPanel>
      </View>
    </> : !loading ? <GlassPanel style={styles.panel}><Text style={styles.copy}>{run?.status === 'failed' ? `Analysis failed: ${run.error_message ?? 'unknown error'}` : 'No completed model analysis is available yet.'}</Text></GlassPanel> : null}
    <View style={styles.footer}><AppButton variant="quiet" onPress={() => router.push('/')}><Text style={styles.link}>Back to Home</Text></AppButton><AppButton onPress={() => router.push('/summary')}><Text style={styles.buttonText}>Review report</Text></AppButton></View>

    <Modal visible={symptomModal} transparent animationType="fade" onRequestClose={() => setSymptomModal(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.heading}>Add symptom</Text>
          <Text style={styles.copy}>Recording time {timeLabel(safePlayheadSec)}</Text>
          <View style={styles.tagList}>{SYMPTOM_TAGS.map((tag) => {
            const selected = selectedSymptoms.includes(tag);
            return <Pressable key={tag} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setSelectedSymptoms((current) => selected ? current.filter((item) => item !== tag) : [...current, tag])} style={[styles.tag, selected && styles.tagSelected]}>
              <Text style={selected ? styles.tagTextSelected : styles.tagText}>{selected ? '✓ ' : ''}{tag}</Text>
            </Pressable>;
          })}</View>
          <View style={styles.modalActions}>
            <AppButton variant="quiet" onPress={() => setSymptomModal(false)}><Text style={styles.link}>Cancel</Text></AppButton>
            <AppButton disabled={eventBusy || !selectedSymptoms.length} onPress={() => { void saveSymptoms(); }}><Text style={styles.buttonText}>{eventBusy ? 'Saving…' : 'Save event'}</Text></AppButton>
          </View>
          {eventError ? <Text accessibilityRole="alert" style={styles.error}>{eventError}</Text> : null}
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <GlassPanel style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.copy}>{sub}</Text></GlassPanel>;
}

function ToolButton({ children, selected, onPress }: { children: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.toolButton, selected && styles.toolSelected]}><Text style={selected ? styles.toolTextSelected : styles.toolText}>{children}</Text></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 }, desktopScroll: { overflow: 'hidden' }, page: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 16, paddingBottom: 104, gap: 14 }, pageDesktop: { flex: 1, maxWidth: 1600, height: '100%', padding: 8, paddingBottom: 6, gap: 6, overflow: 'hidden' }, desktopHeader: { gap: 1, marginBottom: 0 }, desktopTitle: { color: colors.text, fontSize: 22, lineHeight: 25, fontWeight: '800' }, compactStats: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2 },
  studyGrid: { gap: 14 }, studyGridDesktop: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 10 }, monitorColumn: { gap: 12 }, monitorColumnDesktop: { flex: 1, minWidth: 0, minHeight: 0, gap: 8 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }, title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, stat: { flex: 1, minWidth: 190, gap: 5 }, statLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' }, statValue: { color: colors.text, fontSize: 23, fontWeight: '800' },
  panel: { gap: 12 }, monitorPanel: { gap: 12, backgroundColor: '#071419', borderColor: '#29454B' }, monitorPanelDesktop: { flex: 1, minHeight: 430, padding: 11, gap: 7 }, overviewPanelDesktop: { padding: 9, gap: 6 }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, headingCopy: { flex: 1, minWidth: 150, gap: 3 }, headingActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, copy: { color: colors.text, fontSize: 14, lineHeight: 21 }, subheading: { color: colors.text, fontSize: 15, fontWeight: '800' },
  intervalPanel: { gap: 8 }, intervalPanelDesktop: { width: 320, flexBasis: 320, flexGrow: 0, flexShrink: 0, minHeight: 0, padding: 12, gap: 6 }, intervalPanelCollapsed: { width: 64, flexBasis: 64, flexGrow: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: 4 }, collapsedIntervalsButton: { minWidth: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center' }, intervalHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, intervalToggle: { color: colors.cyan, fontWeight: '800' }, intervalColumns: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }, intervalRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 5 }, intervalIndex: { width: 26, color: colors.muted, textAlign: 'right', paddingRight: 6, fontVariant: ['tabular-nums'] }, intervalTime: { flex: 1, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] }, intervalDuration: { width: 38, color: colors.text, textAlign: 'right', fontVariant: ['tabular-nums'] }, intervalList: { maxHeight: 360 }, intervalListDesktop: { flex: 1, minHeight: 0, maxHeight: undefined }, summaryError: { gap: 2, paddingBottom: 6 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, apneaBadge: { backgroundColor: '#D8435230', borderWidth: 1, borderColor: '#D84352' }, normalBadge: { backgroundColor: '#17856B30', borderWidth: 1, borderColor: '#17856B' }, statusText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, controlLabel: { color: '#A9C3C5', fontSize: 13, fontWeight: '700', marginLeft: 4 }, controlDivider: { width: 1, height: 28, backgroundColor: '#29454B', marginHorizontal: 4 }, toolButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#29454B', alignItems: 'center', justifyContent: 'center' }, toolSelected: { backgroundColor: '#49E3A0', borderColor: '#49E3A0' }, toolText: { color: '#D7E9E9', fontSize: 13, fontWeight: '700' }, toolTextSelected: { color: '#071419', fontSize: 13, fontWeight: '800' }, zoomRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, playhead: { color: '#A9C3C5', fontSize: 13, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  chartHint: { color: '#A9C3C5', fontSize: 12, lineHeight: 18 }, rrReadout: { color: '#6EE7E7', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }, minuteControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  eventList: { gap: 6, marginTop: 4 }, eventListDesktop: { maxHeight: 120 }, eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }, eventContent: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, eventTime: { color: '#FFD166', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }, deleteText: { color: colors.coral, fontSize: 13, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, link: { color: colors.text, fontSize: 14, fontWeight: '700' }, buttonText: { color: colors.accentText, fontSize: 14, fontWeight: '800' }, error: { color: colors.coral, fontSize: 14, lineHeight: 21 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.66)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 460, gap: 14, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#060C12' }, tagList: { gap: 8 }, tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#29454B' }, tagSelected: { backgroundColor: '#49E3A020', borderColor: '#49E3A0' }, tagText: { color: colors.text, fontSize: 14 }, tagTextSelected: { color: '#49E3A0', fontSize: 14, fontWeight: '800' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
