import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { AppButton, DetailsDisclosure, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import ShareWithPatient from '@/components/share-with-patient';
import { exportReportPdf, reportPdfBlob } from '@/components/report-export';
import { Chart as PythonChart, NightSummaryPanel } from '@/components/night-summary';
import { getRecordSummary, startRecordSummary, type RecordSummary } from '@/lib/inference';
import { readRecordSummaryCache, writeRecordSummaryCache } from '@/lib/offline-cache';
import { useAuth } from '@/lib/auth-context';
import { EMPTY_REPORT, getLatestPredictionRun, getStudyReport, listPredictionMinutes, listReportPdfs, listSymptomEvents, reportPdfUrl, saveReportPdf, saveStudyReportText, setStudyReportStatus, type EcgSymptomEvent, type PredictionMinute, type PredictionRun, type ReportStatus, type SavedReportPdf, type StudyReport } from '@/lib/queries';
import { useUploadState } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';

const messageOf = (reason: unknown, fallback: string) => typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : fallback;
const duration = (seconds: number | null | undefined) => seconds == null ? '—' : `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const signedLine = (name: string | null, at: string | null) => name && at ? `${name} · ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : '—';
const sameInstant = (a: string | null, b: string | null) => Boolean(a && b) && new Date(a as string).getTime() === new Date(b as string).getTime();
const stages = ['Draft', 'Reviewed', 'Approved'] as const;
const unavailableClinicalMetrics = ['Clinical AHI', 'AI', 'HI', 'Obstructive apnea count', 'Central apnea count', 'Mixed apnea count', 'Hypopnoea count', 'ODI', 'SpO₂ baseline', 'SpO₂ average', 'SpO₂ lowest'] as const;

export default function SummaryScreen() {
  const { study, update } = useUploadState();
  const { session } = useAuth();
  const generatedBy: string = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';
  const uploadId = study.uploadId;
  const [report, setReport] = useState<StudyReport>(EMPTY_REPORT);
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [minutes, setMinutes] = useState<PredictionMinute[]>([]);
  const [recordSummary, setRecordSummary] = useState<RecordSummary | null>(null);
  const [summaryFetch, setSummaryFetch] = useState<{ key: string; error: string }>({ key: '', error: '' });
  const [view, setView] = useState<'Night Summary' | 'Clinical report'>('Night Summary');
  const [opinion, setOpinion] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tab, setTab] = useState<'Clinician report' | 'Patient explanation'>('Clinician report');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfs, setPdfs] = useState<SavedReportPdf[]>([]);
  const [symptomEvents, setSymptomEvents] = useState<EcgSymptomEvent[]>([]);
  const [exporting, setExporting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const summaryKey = `${uploadId ?? ''}:${run?.id ?? ''}`;
  const currentRecordSummary = recordSummary?.uploadId === uploadId && (run?.status !== 'completed' || recordSummary.modelMetrics.runId === run.id) ? recordSummary : null;
  const summaryLoading = run?.status === 'completed' && run.summary_status !== 'failed' && !currentRecordSummary && (run.summary_status !== 'completed' || summaryFetch.key !== summaryKey);
  const summaryError = currentRecordSummary ? '' : summaryFetch.key === summaryKey ? summaryFetch.error : run?.summary_status === 'failed' ? run.summary_error_message ?? 'Full-night summary failed.' : '';

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    if (session?.user.id && study.runId) {
      void readRecordSummaryCache(session.user.id, uploadId, study.runId).then((cached) => {
        if (!cancelled && cached?.uploadId === uploadId && cached.modelMetrics.runId === study.runId
          && cached.charts?.screen?.heartRateSvg && cached.charts.screen.hourlyApneaSvg && cached.charts.screen.rrHistogramSvg) setRecordSummary(cached);
      }).catch(() => {});
    }
    void getStudyReport(uploadId).then((saved) => {
      if (!cancelled) { setReport(saved); setOpinion(saved.clinicianOpinion); setExplanation(saved.patientExplanation); update({ reportStatus: saved.status }); }
    }).catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load the clinical report.')); });
    void listReportPdfs(uploadId).then((savedPdfs) => {
      if (!cancelled) setPdfs(savedPdfs ?? []);
    }).catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load saved reports.')); });
    void getLatestPredictionRun(uploadId).then(async (latest) => {
      if (cancelled) return;
      setRun(latest);
      setSummaryFetch(latest ? (current) => current.key === `${uploadId}:` ? { key: '', error: '' } : current
        : { key: `${uploadId}:`, error: 'No analysis run was found for this recording.' });
      if (latest?.status !== 'completed') return;
      void listPredictionMinutes(latest.id).then((rows) => { if (!cancelled) setMinutes(rows); })
        .catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load model minute results.')); });
      if (session?.user.id) {
        const cached = await readRecordSummaryCache(session.user.id, uploadId, latest.id).catch(() => null);
        if (!cancelled && cached?.uploadId === uploadId && cached.modelMetrics.runId === latest.id
          && cached.charts?.screen?.heartRateSvg && cached.charts.screen.hourlyApneaSvg && cached.charts.screen.rrHistogramSvg) setRecordSummary(cached);
      }
    }).catch((reason) => {
      if (!cancelled) setSummaryFetch({ key: `${uploadId}:`, error: messageOf(reason, 'Could not load the analysis run or its summary charts.') });
    });
    return () => { cancelled = true; };
  }, [uploadId, study.runId, update, session?.user.id]);

  useEffect(() => {
    if (!uploadId || run?.status !== 'completed') return;
    let cancelled = false;
    let refreshing = false;
    const refreshStatus = async () => {
      if (refreshing || cancelled) return;
      refreshing = true;
      try {
        const latest = await getLatestPredictionRun(uploadId);
        if (!cancelled && latest?.id === run.id) setRun(latest);
      } catch { /* retain the last saved progress while offline */ }
      finally { refreshing = false; }
    };
    if (run.summary_status === 'not_started') void startRecordSummary(uploadId).catch((reason) => {
      if (!cancelled) setSummaryFetch({ key: summaryKey, error: messageOf(reason, 'Could not start the full-night summary.') });
    });
    if (run.summary_status === 'completed') {
      getRecordSummary(uploadId)
        .then((value) => {
          if (!cancelled) {
            setRecordSummary(value);
            setSummaryFetch({ key: summaryKey, error: '' });
            if (session?.user.id && value.modelMetrics.runId === run.id) void writeRecordSummaryCache(session.user.id, uploadId, run.id, value).catch(() => {});
          }
        })
        .catch((reason) => { if (!cancelled) setSummaryFetch({ key: summaryKey, error: messageOf(reason, 'Could not load the ECG night summary.') }); });
    }
    if (run.summary_status !== 'completed' && run.summary_status !== 'failed') {
      void refreshStatus();
      const timer = setInterval(() => { void refreshStatus(); }, 2000);
      return () => { cancelled = true; clearInterval(timer); };
    }
    return () => { cancelled = true; };
  }, [uploadId, run?.id, run?.status, run?.summary_status, summaryKey, session?.user.id]);

  const retrySummary = async () => {
    if (!uploadId) return;
    try {
      await startRecordSummary(uploadId, true);
      const latest = await getLatestPredictionRun(uploadId);
      setRun(latest);
      setRecordSummary(null);
      setSummaryFetch(latest ? { key: '', error: '' } : { key: `${uploadId}:`, error: 'The summary job started, but its analysis run is not visible yet.' });
    } catch (reason) { setSummaryFetch({ key: summaryKey, error: messageOf(reason, 'Could not restart the full-night summary.') }); }
  };

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    listSymptomEvents(uploadId)
      .then((saved) => { if (!cancelled) setSymptomEvents(saved); })
      .catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load symptom events.')); });
    return () => { cancelled = true; };
  }, [uploadId]);

  const status: ReportStatus = uploadId ? report.status : study.reportStatus;
  const stageIndex = stages.indexOf(status);
  const locked = status === 'Approved';
  const editable = Boolean(uploadId) && !locked && !busy;
  const completed = run?.status === 'completed';
  const estimates = currentRecordSummary?.modelMetrics;
  const proxyAhi = run?.status === 'completed' && run.total_minutes != null && run.total_minutes > 0 && run.apnea_minutes != null
    ? run.apnea_minutes / (run.total_minutes / 60) : null;
  const dirty = opinion !== report.clinicianOpinion || explanation !== report.patientExplanation;
  const apply = (next: StudyReport) => { setReport(next); setOpinion(next.clinicianOpinion); setExplanation(next.patientExplanation); update({ reportStatus: next.status }); };

  // One action for both: the PDF (web: browser dialog, choose Save as PDF or a
  // printer; mobile: PDF file + share sheet, which also offers Print). Reports
  // that are not approved yet carry a DRAFT / REVIEWED watermark.
  const exportPdf = async (signed: StudyReport = report) => {
    setExporting(true);
    try {
      const currentEvents = uploadId ? await listSymptomEvents(uploadId) : symptomEvents;
      setSymptomEvents(currentEvents);
      let fullSummary = currentRecordSummary;
      if (uploadId && !fullSummary) {
        try { fullSummary = await getRecordSummary(uploadId); setRecordSummary(fullSummary); }
        catch { /* Model output and sign-off remain exportable without ECG trend metrics. */ }
      }
      setMessage(await exportReportPdf({ study: { ...study, reportStatus: status }, generatedBy, prediction: run, report: uploadId ? signed : null, symptomEvents: currentEvents, recordSummary: fullSummary }));
    }
    catch (reason) { setMessage(messageOf(reason, 'Could not create the report.')); }
    finally { setExporting(false); }
  };
  const exportOrPrint = () => exportPdf({ ...report, clinicianOpinion: opinion, patientExplanation: explanation });
  const save = async () => {
    if (!uploadId) return;
    setBusy(true);
    try { apply(await saveStudyReportText(uploadId, { clinicianOpinion: opinion, patientExplanation: explanation })); setMessage('Report saved.'); }
    catch (reason) { setMessage(messageOf(reason, 'Could not save the report.')); }
    finally { setBusy(false); }
  };
  const moveTo = async (next: ReportStatus) => {
    if (!uploadId) { update({ reportStatus: next }); return null; }
    setBusy(true);
    try {
      if (!locked) await saveStudyReportText(uploadId, { clinicianOpinion: opinion, patientExplanation: explanation });
      const saved = await setStudyReportStatus(uploadId, next); apply(saved); return saved;
    } catch (reason) { setMessage(messageOf(reason, 'Could not update the report.')); return null; }
    finally { setBusy(false); }
  };
  // Keeps the signed PDF in Supabase (bucket report-pdfs), one per approval.
  const archive = async (signed: StudyReport) => {
    if (!uploadId) return;
    setArchiving(true);
    try {
      const currentEvents = await listSymptomEvents(uploadId);
      setSymptomEvents(currentEvents);
      let fullSummary = currentRecordSummary;
      if (!fullSummary) {
        try { fullSummary = await getRecordSummary(uploadId); setRecordSummary(fullSummary); }
        catch { /* Keep the signed model report available if ECG trend analysis is offline. */ }
      }
      const pdf = await reportPdfBlob({ study: { ...study, reportStatus: 'Approved' }, generatedBy, prediction: run, report: signed, symptomEvents: currentEvents, recordSummary: fullSummary });
      const result = await saveReportPdf(uploadId, study.studyId, pdf, { approvedByName: signed.approvedByName, approvedAt: signed.approvedAt });
      setPdfs(await listReportPdfs(uploadId));
      setMessage(result === 'saved' ? 'Approved, signed and saved to Supabase.' : 'This approved version is already saved in Supabase. Nothing was saved again.');
    } catch (reason) { setMessage(`Approved and signed, but the PDF was not saved: ${messageOf(reason, 'unknown error')}. Use "Save PDF to Supabase" to try again.`); }
    finally { setArchiving(false); }
  };
  const primary = async () => {
    if (status === 'Draft') { if (await moveTo('Reviewed') || !uploadId) setMessage('Report marked reviewed.'); }
    else if (status === 'Reviewed') {
      if (uploadId && (!opinion.trim() || !explanation.trim())) { setMessage('Write the clinician opinion and the patient explanation before approving.'); return; }
      const signed = await moveTo('Approved');
      if (signed) await archive(signed);
      else if (!uploadId) setMessage('Approved and signed. Use Export PDF / Print for the final report.');
    }
    else await exportOrPrint();
  };
  const stepBack = async () => {
    const back: ReportStatus = status === 'Approved' ? 'Reviewed' : 'Draft';
    if (await moveTo(back) || !uploadId) setMessage(back === 'Reviewed' ? 'Approval undone. The report is back to Reviewed and can be edited.' : 'Review undone. The report is back to Draft.');
  };
  const openPdf = async (pdf: SavedReportPdf) => { try { await Linking.openURL(await reportPdfUrl(pdf.storagePath)); } catch (reason) { setMessage(messageOf(reason, 'Could not open the PDF.')); } };
  const needsArchive = Boolean(uploadId) && locked && !sameInstant(pdfs[0]?.approvedAt ?? null, report.approvedAt);

  if (study.status !== 'ready') return <View style={styles.gate}><Text style={styles.title}>No completed study summary</Text><Text style={styles.copy}>Upload a record and complete its analysis first.</Text><AppButton href="/upload"><Text style={styles.buttonText}>Go to upload</Text></AppButton></View>;
  return <ScrollView contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY SUMMARY" title="Clinical summary" description={`${study.studyId || 'Study'} · report ${status.toLowerCase()}`} />
    <View style={styles.viewTabs}>{(['Night Summary', 'Clinical report'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[styles.viewTab, view === value && styles.viewTabActive]}><Text selectable={false} style={[styles.tabText, view === value && styles.tabTextActive]}>{value}</Text></Pressable>)}</View>
    {view === 'Night Summary' ? <NightSummaryPanel summary={currentRecordSummary} loading={summaryLoading} error={summaryError} run={run} minutes={minutes} durationFallbackSeconds={study.durationSeconds} onRetry={() => { void retrySummary(); }} /> : <>

    <GlassPanel style={styles.panel}>
      <Text style={styles.title}>Model results</Text>
      {!completed ? <Text style={styles.copy}>{run?.status === 'failed' ? `Analysis failed: ${run.error_message ?? 'unknown error'}` : 'Model analysis is pending.'}</Text> : <>
        <View style={styles.grid}>
          <Metric label="Recording duration" value={duration(study.durationSeconds)} />
          <Metric label="Analysed minutes" value={String(run.total_minutes ?? '—')} />
          <Metric label="Apnea minutes" value={String(run.apnea_minutes ?? '—')} />
          <Metric label="Apnea minute share" value={run.apnea_percent == null ? '—' : `${run.apnea_percent.toFixed(1)}%`} />
        </View>
        <Text style={styles.note}>Each minute is classified independently by the trained model at a 0.5 probability threshold. This is a model output and requires clinician interpretation.</Text>
        <View style={styles.grid}>
          <Metric label="Probability-weighted minutes · Σpᵢ" value={estimates?.probabilityWeightedApneaMinutes == null ? 'Unavailable' : estimates.probabilityWeightedApneaMinutes.toFixed(1)} />
          <Metric label="Probability-weighted burden · 100Σpᵢ/N" value={estimates?.probabilityWeightedApneaSharePercent == null ? 'Unavailable' : `${estimates.probabilityWeightedApneaSharePercent.toFixed(1)}%`} />
          <Metric label="Predicted contiguous runs" value={estimates?.predictedRuns == null ? 'Unavailable' : String(estimates.predictedRuns)} />
          <Metric label="Median heart rate" value={currentRecordSummary?.medianHrBpm == null ? 'Unavailable' : `${currentRecordSummary.medianHrBpm.toFixed(0)} bpm`} />
          <Metric label="SDNN / RMSSD estimate" value={currentRecordSummary ? `${currentRecordSummary.sdnnMs == null ? 'Unavailable' : `${currentRecordSummary.sdnnMs.toFixed(0)} ms`} / ${currentRecordSummary.rmssdMs == null ? 'Unavailable' : `${currentRecordSummary.rmssdMs.toFixed(0)} ms`}` : 'Loading'} />
          <Metric label="Valid RR intervals" value={currentRecordSummary?.validRrPercent == null ? 'Unavailable' : `${currentRecordSummary.validRrPercent.toFixed(1)}%`} />
        </View>
        <Text style={styles.note}>A run joins adjacent positive minute windows at the 50% threshold. Runs and model burden are not respiratory event counts or AHI. HRV is an estimate from {currentRecordSummary?.qrsAnnotationsAvailable ? 'normal-beat QRS annotations.' : 'automatically detected R-peaks.'}</Text>
      </>}
    </GlassPanel>

    <GlassPanel style={styles.panel}>
      <Text style={styles.title}>Clinical PSG / SpO₂ results</Text>
      <View style={styles.clinicalGrid}>
        <View style={styles.clinicalMetric}><Text style={styles.clinicalLabel}>Estimated AHI proxy (model)</Text><Text style={styles.clinicalValue}>{proxyAhi == null ? 'Unavailable' : proxyAhi.toFixed(1) + ' /h'}</Text></View>
        <View style={styles.clinicalMetric}><Text style={styles.clinicalLabel}>Model-positive windows</Text><Text style={styles.clinicalValue}>{run?.status === 'completed' ? String(run.apnea_minutes ?? '—') + ' / ' + String(run.total_minutes) : 'Unavailable'}</Text></View>
        <View style={styles.clinicalMetric}><Text style={styles.clinicalLabel}>Model-positive share</Text><Text style={styles.clinicalValue}>{run?.status === 'completed' && run.apnea_percent != null ? run.apnea_percent.toFixed(1) + '%' : 'Unavailable'}</Text></View>
      </View>
      <Text style={styles.note}>Proxy = positive 1-minute windows ÷ analyzed hours. It assumes one event per positive window and treats analyzed time as sleep time; it is not clinical AHI. ECG does not measure airflow, respiratory effort, sleep staging, arousals, or SpO₂.</Text>
      <DetailsDisclosure title="Show unavailable PSG / SpO₂ values (11)">
        <View style={styles.clinicalGrid}>{unavailableClinicalMetrics.map((label) => <View key={label} style={styles.clinicalMetric}><Text style={styles.clinicalLabel}>{label}</Text><Text style={styles.clinicalValue}>N/A</Text></View>)}</View>
      </DetailsDisclosure>
    </GlassPanel>

    <GlassPanel style={styles.panel}>
      <View style={styles.row}><Text style={styles.title}>Report</Text><Text style={styles.status}>{status}</Text></View>
      <View style={styles.stages}>{stages.map((value, index) => <View key={value} style={styles.stage}><View style={[styles.stageDot, index < stageIndex && styles.stageDone, index === stageIndex && styles.stageCurrent]} /><Text style={[styles.copy, index === stageIndex && styles.stageLabelCurrent]}>{value}</Text>{index < stages.length - 1 ? <View style={[styles.stageLine, index < stageIndex && styles.stageLineDone]} /> : null}</View>)}</View>
      <View style={styles.tabs}>{(['Clinician report', 'Patient explanation'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text selectable={false} style={[styles.tabText, tab === value && styles.tabTextActive]}>{value}</Text></Pressable>)}</View>
      <View style={styles.reportBody}>{tab === 'Clinician report' ? <>
        <Text style={styles.fieldLabel}>System findings</Text>
        <Text style={styles.copy}>{completed ? `${run.apnea_minutes} apnea-classified minutes out of ${run.total_minutes} analysed minutes (${run.apnea_percent?.toFixed(1)}%).` : 'No completed model result.'}</Text>
        <PythonChart title="Minute-by-minute model predictions · 50% threshold" xml={currentRecordSummary?.charts.screen.modelPredictionSvg} aspect={14 / 2.7} wide />
        <Text style={styles.fieldLabel}>Clinical sleep indices</Text>
        <Text style={styles.copy}>{proxyAhi == null ? 'No model-derived AHI proxy is available.' : 'Estimated AHI proxy: ' + proxyAhi.toFixed(1) + ' /h. This uses one model-positive minute window as one apnea/hypopnea event and analyzed time as sleep time; it is not a clinical AHI.'}</Text>
        <Text style={styles.fieldLabel}>Clinician opinion</Text>
        <TextInput multiline editable={editable} value={opinion} onChangeText={setOpinion} placeholder="Clinician interpretation and recommendations" placeholderTextColor={colors.muted} style={[styles.input, !editable && styles.inputLocked]} accessibilityLabel="Clinician opinion" />
      </> : <>
        <Text style={styles.fieldHint}>Write this for the patient in plain language. They see it on their dashboard once the report is approved.</Text>
        <TextInput multiline editable={editable} value={explanation} onChangeText={setExplanation} placeholder="Plain language explanation for the patient" placeholderTextColor={colors.muted} style={[styles.input, !editable && styles.inputLocked]} accessibilityLabel="Patient explanation" />
      </>}</View>
      {uploadId ? <View style={styles.signoffLines}>
        <Text style={styles.copy}><Text style={styles.signoffLabel}>Reviewed by </Text>{signedLine(report.reviewedByName, report.reviewedAt)}</Text>
        <Text style={styles.copy}><Text style={styles.signoffLabel}>Approved and signed by </Text>{report.approvedAt ? signedLine(report.approvedByName, report.approvedAt) : <Text style={styles.signoffPending}>{generatedBy} · signs when you approve</Text>}</Text>
        {locked ? <Text style={styles.fieldHint}>Approved reports are locked. Use ↩ Back to Reviewed to edit.</Text> : null}
      </View> : null}
      {uploadId ? <View style={styles.savedList}>
        <Text style={styles.fieldLabel}>Saved approved reports</Text>
        {pdfs.length ? pdfs.map((pdf, index) => <View key={pdf.id} style={styles.savedRow}>
          <Text style={styles.copy}>{index === 0 ? 'Latest · ' : ''}{signedLine(pdf.approvedByName, pdf.approvedAt ?? pdf.createdAt)}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void openPdf(pdf); }} style={styles.savedOpen}><Text selectable={false} style={styles.selected}>Download</Text></Pressable>
        </View>) : <Text style={styles.fieldHint}>None yet. The signed PDF is saved here automatically when you approve.</Text>}
        {needsArchive ? <AppButton variant="quiet" onPress={() => { void archive(report); }} disabled={archiving}><Text style={styles.link}>{archiving ? 'Saving PDF…' : 'Save PDF to Supabase'}</Text></AppButton> : null}
      </View> : null}
      <View style={styles.row}>
        <AppButton onPress={() => { void primary(); }} disabled={busy || exporting || archiving}><Text style={styles.buttonText}>{exporting ? 'Creating PDF…' : archiving ? 'Saving PDF…' : busy ? 'Saving…' : status === 'Draft' ? 'Mark report reviewed' : status === 'Reviewed' ? 'Approve & sign' : 'Export PDF / Print'}</Text></AppButton>
        {uploadId && dirty && !locked ? <AppButton variant="quiet" onPress={() => { void save(); }} disabled={busy}><Text style={styles.link}>Save draft</Text></AppButton> : null}
        {status !== 'Draft' ? <AppButton variant="quiet" onPress={() => { void stepBack(); }} disabled={busy}><Text style={styles.link}>↩ Back to {status === 'Approved' ? 'Reviewed' : 'Draft'}</Text></AppButton> : null}
        {!locked ? <AppButton variant="quiet" onPress={() => { void exportOrPrint(); }} disabled={exporting}><Text style={styles.link}>Export PDF / Print</Text></AppButton> : null}
      </View>
      {message ? <Text accessibilityRole="alert" style={styles.copy}>{message}</Text> : null}
    </GlassPanel>

    {study.patientId ? <ShareWithPatient patientId={study.patientId} /> : null}
    </>}
  </ScrollView>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.note}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 20, gap: 16, paddingBottom: 112 },
  gate: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  panel: { gap: 14 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '22%', minWidth: 150, gap: 4, padding: 14, borderRadius: 14, backgroundColor: colors.scrim },
  value: { color: colors.text, fontWeight: '800', fontSize: 22 },
  clinicalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, clinicalMetric: { flexGrow: 1, flexBasis: '15%', minWidth: 138, gap: 3, padding: 10, borderRadius: 12, backgroundColor: colors.scrim }, clinicalLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, clinicalValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  status: { color: colors.text, fontSize: 14, fontWeight: '800' },
  stages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.muted },
  stageDone: { backgroundColor: colors.accent, borderColor: colors.accent }, stageCurrent: { borderColor: colors.text }, stageLabelCurrent: { fontWeight: '800' },
  stageLine: { width: 32, height: 2, marginHorizontal: 4, backgroundColor: colors.border }, stageLineDone: { backgroundColor: colors.accent },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewTabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewTab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: 'transparent', cursor: 'pointer', userSelect: 'none' } as never,
  viewTabActive: { borderBottomColor: colors.accent },
  tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', cursor: 'pointer', userSelect: 'none' } as never,
  tabActive: { borderBottomColor: colors.accent }, tabText: { color: colors.muted, fontSize: 14, fontWeight: '700' }, tabTextActive: { color: colors.text },
  reportBody: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.scrim },
  fieldLabel: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 4 },
  fieldHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: { minHeight: 110, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.panelDeep, color: colors.text, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular, textAlignVertical: 'top' },
  inputLocked: { opacity: 0.75 },
  signoffLines: { gap: 4 }, signoffLabel: { color: colors.muted, fontWeight: '700' }, signoffPending: { color: colors.muted, fontStyle: 'italic' },
  savedList: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  savedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  savedOpen: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8, cursor: 'pointer' } as never,
  selected: { color: colors.cyan, fontWeight: '800' },
  link: { color: colors.text, fontSize: 14, fontWeight: '700' },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '800' },
});
