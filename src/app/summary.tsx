import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import ShareWithPatient from '@/components/share-with-patient';
import { exportReportPdf, reportPdfBlob } from '@/components/report-export';
import { useAuth } from '@/lib/auth-context';
import { EMPTY_REPORT, getLatestPredictionRun, getStudyReport, listPredictionMinutes, listReportPdfs, listSymptomEvents, reportPdfUrl, saveReportPdf, saveStudyReportText, setStudyReportStatus, type EcgSymptomEvent, type PredictionMinute, type PredictionRun, type ReportStatus, type SavedReportPdf, type StudyReport } from '@/lib/queries';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';

const messageOf = (reason: unknown, fallback: string) => typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : fallback;
const duration = (seconds: number | null | undefined) => seconds == null ? '—' : `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function SummaryScreen() {
  const { study, update } = useUploadState();
  const { session } = useAuth();
  const generatedBy = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';
  const uploadId = study.uploadId;
  const [report, setReport] = useState<StudyReport>(EMPTY_REPORT);
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [minutes, setMinutes] = useState<PredictionMinute[]>([]);
  const [opinion, setOpinion] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tab, setTab] = useState<'Clinician report' | 'Patient explanation'>('Clinician report');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfs, setPdfs] = useState<SavedReportPdf[]>([]);
  const [symptomEvents, setSymptomEvents] = useState<EcgSymptomEvent[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    Promise.all([getStudyReport(uploadId), getLatestPredictionRun(uploadId), listReportPdfs(uploadId)])
      .then(async ([saved, latest, savedPdfs]) => {
        if (cancelled) return;
        setReport(saved); setOpinion(saved.clinicianOpinion); setExplanation(saved.patientExplanation); setPdfs(savedPdfs ?? []); setRun(latest); update({ reportStatus: saved.status });
        if (latest?.status === 'completed') setMinutes(await listPredictionMinutes(latest.id));
      })
      .catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load study results.')); });
    return () => { cancelled = true; };
  }, [uploadId, update]);

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    listSymptomEvents(uploadId)
      .then((saved) => { if (!cancelled) setSymptomEvents(saved); })
      .catch((reason) => { if (!cancelled) setMessage(messageOf(reason, 'Could not load symptom events.')); });
    return () => { cancelled = true; };
  }, [uploadId]);

  const status: ReportStatus = uploadId ? report.status : study.reportStatus;
  const locked = status === 'Approved';
  const apply = (next: StudyReport) => { setReport(next); setOpinion(next.clinicianOpinion); setExplanation(next.patientExplanation); update({ reportStatus: next.status }); };
  const exportPdf = async (signed: StudyReport = report) => {
    setExporting(true);
    try {
      const currentEvents = uploadId ? await listSymptomEvents(uploadId) : symptomEvents;
      setSymptomEvents(currentEvents);
      setMessage(await exportReportPdf({ study: { ...study, reportStatus: status }, generatedBy, prediction: run, report: uploadId ? signed : null, symptomEvents: currentEvents }));
    }
    catch (reason) { setMessage(messageOf(reason, 'Could not create the report.')); }
    finally { setExporting(false); }
  };
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
  const archive = async (signed: StudyReport) => {
    if (!uploadId) return;
    try {
      const currentEvents = await listSymptomEvents(uploadId);
      setSymptomEvents(currentEvents);
      const pdf = await reportPdfBlob({ study: { ...study, reportStatus: 'Approved' }, generatedBy, prediction: run, report: signed, symptomEvents: currentEvents });
      await saveReportPdf(uploadId, study.studyId, pdf, { approvedByName: signed.approvedByName, approvedAt: signed.approvedAt });
      setPdfs(await listReportPdfs(uploadId)); setMessage('Approved report saved.');
    } catch (reason) { setMessage(`Approved, but PDF saving failed: ${messageOf(reason, 'unknown error')}`); }
  };
  const primary = async () => {
    if (status === 'Draft') { const saved = await moveTo('Reviewed'); if (saved || !uploadId) setMessage('Report marked reviewed.'); }
    else if (status === 'Reviewed') {
      if (uploadId && (!opinion.trim() || !explanation.trim())) { setMessage('Write the clinician opinion and patient explanation before approving.'); return; }
      const signed = await moveTo('Approved');
      if (signed) await archive(signed); else if (!uploadId) setMessage('Approved. Export the report to save a copy.');
    } else await exportPdf({ ...report, clinicianOpinion: opinion, patientExplanation: explanation });
  };
  const openPdf = async (pdf: SavedReportPdf) => { try { await Linking.openURL(await reportPdfUrl(pdf.storagePath)); } catch (reason) { setMessage(messageOf(reason, 'Could not open the PDF.')); } };
  const completed = run?.status === 'completed';
  const dirty = opinion !== report.clinicianOpinion || explanation !== report.patientExplanation;

  if (study.status !== 'ready') return <View style={styles.gate}><Text style={styles.title}>No completed study summary</Text><Text>Upload a record and complete its analysis first.</Text><AppButton href="/upload"><Text>Go to upload</Text></AppButton></View>;
  return <ScrollView contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY SUMMARY" title="Clinical summary" description={`${study.studyId || 'Study'} · report ${status.toLowerCase()}`} />
    <GlassPanel style={styles.panel}>
      <Text style={styles.title}>Model results</Text>
      {!completed ? <Text>{run?.status === 'failed' ? `Analysis failed: ${run.error_message ?? 'unknown error'}` : 'Model analysis is pending.'}</Text> : <>
        <View style={styles.grid}>
          <Metric label="Recording duration" value={duration(study.durationSeconds)} />
          <Metric label="Analysed minutes" value={String(run.total_minutes ?? '—')} />
          <Metric label="Apnea minutes" value={String(run.apnea_minutes ?? '—')} />
          <Metric label="Apnea minute share" value={run.apnea_percent == null ? '—' : `${run.apnea_percent.toFixed(1)}%`} />
        </View>
        <Text style={styles.note}>Each minute is classified independently by the trained model at a 0.5 probability threshold. This is a model output and requires clinician interpretation.</Text>
        <Text style={styles.copy}>Minute-by-minute predictions</Text>
        <View style={styles.minutes}>{minutes.map((minute) => <View key={minute.minute_index} style={[styles.minute, minute.is_apnea && styles.apnea]}><Text style={styles.minuteText}>{minute.minute_index + 1}</Text></View>)}</View>
      </>}
    </GlassPanel>
    <GlassPanel style={styles.panel}>
      <View style={styles.row}><Text style={styles.title}>Report</Text><Text>{status}</Text></View>
      <View style={styles.row}>{(['Clinician report', 'Patient explanation'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)}><Text style={tab === value ? styles.selected : styles.copy}>{value}</Text></Pressable>)}</View>
      <TextInput multiline editable={Boolean(uploadId) && !locked && !busy} value={tab === 'Clinician report' ? opinion : explanation} onChangeText={tab === 'Clinician report' ? setOpinion : setExplanation} placeholder={tab === 'Clinician report' ? 'Clinician interpretation and recommendations' : 'Plain language explanation for the patient'} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.note}>System findings: {completed ? `${run.apnea_minutes} apnea-classified minutes out of ${run.total_minutes} analysed minutes (${run.apnea_percent?.toFixed(1)}%).` : 'No completed model result.'}</Text>
      {pdfs.map((pdf) => <Pressable key={pdf.id} onPress={() => { void openPdf(pdf); }}><Text style={styles.selected}>Download saved signed report · {new Date(pdf.createdAt).toLocaleDateString()}</Text></Pressable>)}
      <View style={styles.row}>
        <AppButton onPress={() => { void primary(); }} disabled={busy || exporting}><Text>{exporting ? 'Creating PDF…' : busy ? 'Saving…' : status === 'Draft' ? 'Mark reviewed' : status === 'Reviewed' ? 'Approve and sign' : 'Export PDF / Print'}</Text></AppButton>
        {uploadId && dirty && !locked ? <AppButton variant="quiet" onPress={() => { void save(); }} disabled={busy}><Text>Save draft</Text></AppButton> : null}
        {!locked ? <AppButton variant="quiet" onPress={() => { void exportPdf({ ...report, clinicianOpinion: opinion, patientExplanation: explanation }); }}><Text>Export PDF</Text></AppButton> : null}
      </View>
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
    </GlassPanel>
    {study.patientId ? <ShareWithPatient patientId={study.patientId} /> : null}
  </ScrollView>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.note}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ page: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 20, gap: 16, paddingBottom: 112 }, gate: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' }, panel: { gap: 14 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, copy: { color: colors.text, fontSize: 14 }, note: { color: colors.muted, fontSize: 13, lineHeight: 19 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, metric: { flexGrow: 1, flexBasis: '22%', minWidth: 150, gap: 4, padding: 14, borderRadius: 14, backgroundColor: colors.scrim }, value: { color: colors.text, fontWeight: '800', fontSize: 22 }, minutes: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, minute: { padding: 6, borderRadius: 5, backgroundColor: colors.accent }, apnea: { backgroundColor: colors.coral }, minuteText: { color: colors.accentText, fontSize: 11 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, selected: { color: colors.cyan, fontWeight: '800' }, input: { minHeight: 110, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, textAlignVertical: 'top' } });
