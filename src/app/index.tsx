import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton, GlassPanel, PosaText as Text } from '@/components/posa-ui';
import { sampleEvents, useUploadState, type ApneaEvent, type Study, type SummaryMetrics } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { getDeletionLog, listRecentEcgUploads, restoreEcgUpload, softDeleteEcgUpload, timeAgo, type DeletionLogEntry, type RecentEcgUpload } from '@/lib/queries';

type StudyStatus = 'Awaiting analysis' | 'Needs review' | 'Processing' | 'Approved' | 'Failed';
// The illustrative sample studies from the team's UI (shown after real uploads,
// labelled SAMPLE, never deletable). They open with full sample charts.
type SampleRow = { id: string; status: StudyStatus; age: string; sex: string; duration: string; severity: string; burden: string; total: number; ago: string; progress?: number; apneaMinutes: string; clearMinutes: string; metrics: SummaryMetrics | null };
type StudyRecord = { id: string; status: StudyStatus; age: string; sex: string; detail: string; ago: string; upload?: RecentEcgUpload; sample?: SampleRow };

const samples: SampleRow[] = [
  { id: 'REC-8842-PT', status: 'Needs review', age: '54', sex: 'M', duration: '08:30:00', severity: 'Severe OSA', burden: '47.2%', total: 17, ago: '10 min ago', apneaMinutes: '240', clearMinutes: '268', metrics: { rPeakCount: 41820, annotationRuns: 9, medianHrBpm: 82, sdnnMs: 87, rmssdMs: 45, validRrPercent: 100 } },
  { id: 'REC-8841-KL', status: 'Needs review', age: '61', sex: 'M', duration: '08:12:00', severity: 'Severe OSA', burden: '49.3%', total: 19, ago: '42 min ago', apneaMinutes: '242', clearMinutes: '250', metrics: null },
  { id: 'REC-8839-MN', status: 'Needs review', age: '47', sex: 'F', duration: '07:48:00', severity: 'Severe OSA', burden: '47.6%', total: 15, ago: '1 h 15 min ago', apneaMinutes: '223', clearMinutes: '245', metrics: null },
  { id: 'REC-8845-QA', status: 'Processing', age: '58', sex: 'M', duration: '08:00:00', severity: 'Pending', burden: '', total: 19, ago: '8 min ago', progress: 62, apneaMinutes: '', clearMinutes: '', metrics: null },
  { id: 'REC-8827-TS', status: 'Approved', age: '66', sex: 'M', duration: '07:30:00', severity: 'Moderate', burden: '31.0%', total: 12, ago: 'Yesterday', apneaMinutes: '140', clearMinutes: '310', metrics: null },
  { id: 'REC-8829-RX', status: 'Approved', age: '39', sex: 'F', duration: '07:18:00', severity: 'Mild / Normal', burden: '16.6%', total: 4, ago: '5 h 20 min ago', apneaMinutes: '73', clearMinutes: '365', metrics: null },
];
const sampleRecords: StudyRecord[] = samples.map((row) => ({ id: row.id, status: row.status, age: row.age, sex: row.sex === 'M' ? 'Male' : 'Female', detail: row.duration, ago: row.ago, sample: row }));
function makeEvents(count: number): ApneaEvent[] {
  return Array.from({ length: count }, (_, index) => ({ ...sampleEvents[index % sampleEvents.length], id: index + 1 }));
}

const statusOf = (dbStatus: string): StudyStatus => dbStatus === 'processing' ? 'Processing' : dbStatus === 'failed' ? 'Failed' : 'Awaiting analysis';
const formatOf = (name: string | null): Study['format'] => /\.edf\b/i.test(name ?? '') ? 'edf' : /\.(hea|dat)\b/i.test(name ?? '') ? 'wfdb' : /\.(png|jpe?g|tiff?)\b/i.test(name ?? '') ? 'image' : null;

function toRecord(upload: RecentEcgUpload): StudyRecord {
  return {
    id: upload.recordCode, status: statusOf(upload.status), upload, ago: timeAgo(upload.createdAt),
    age: upload.ageYears != null ? String(upload.ageYears) : '—', sex: sexLabel(upload.sex) || '—',
    detail: [upload.samplingRateHz ? `${upload.samplingRateHz} Hz` : null, upload.leadConfiguration].filter(Boolean).join(' · ') || 'Signal settings unavailable',
  };
}

const sexLabel = (value: string | null) => value === 'unspecified' ? 'Unknown' : value ? value[0].toUpperCase() + value.slice(1) : '';

const filterLabels = ['All', 'Awaiting analysis', 'Needs review', 'Processing', 'Approved', 'Failed'] as const;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const { session } = useAuth();
  const displayName: string = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';
  const { study, update, reset } = useUploadState();
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filterLabels)[number]>('All');

  const [reloadKey, setReloadKey] = useState(0);
  const [logKey, setLogKey] = useState(0);
  const [recentLog, setRecentLog] = useState<DeletionLogEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    getDeletionLog(3).then((rows) => { if (!cancelled) setRecentLog(rows); }).catch(() => { if (!cancelled) setRecentLog([]); });
    return () => { cancelled = true; };
  }, [logKey]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; code: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const myId = session?.user?.id;

  useEffect(() => {
    let cancelled = false;
    listRecentEcgUploads(50)
      .then((rows) => { if (!cancelled) { setRecords(rows.map(toRecord)); setLoadError(''); } })
      .catch((reason) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Could not load studies.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const messageOf = (reason: unknown, fallback: string) => typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : fallback;
  const remove = async (record: StudyRecord) => {
    const upload = record.upload;
    if (!upload) return;
    setBusyId(upload.id);
    setActionError('');
    try {
      await softDeleteEcgUpload(upload.id);
      setRecords((rows) => rows.filter((row) => row.upload?.id !== upload.id));
      setDeleted({ id: upload.id, code: record.id });
      setLogKey((k) => k + 1);
      if (study.uploadId === upload.id) reset();
    } catch (reason) { setActionError(messageOf(reason, 'Could not delete the study.')); }
    finally { setBusyId(null); setConfirmId(null); }
  };
  const undo = async () => {
    if (!deleted) return;
    setActionError('');
    try { await restoreEcgUpload(deleted.id); setDeleted(null); setReloadKey((k) => k + 1); setLogKey((k) => k + 1); }
    catch (reason) { setActionError(messageOf(reason, 'Could not restore the study.')); }
  };

  const allRecords = useMemo(() => [...records, ...sampleRecords], [records]);
  const filters = filterLabels
    .map((label) => ({ label, count: label === 'All' ? allRecords.length : allRecords.filter((record) => record.status === label).length }))
    .filter((item) => item.label === 'All' || item.count > 0 || item.label === filter);
  const visible = useMemo(() => allRecords.filter((record) => (filter === 'All' || record.status === filter) && `${record.id} ${record.status}`.toLowerCase().includes(query.trim().toLowerCase())), [allRecords, filter, query]);
  const awaiting = records.filter((record) => record.status === 'Awaiting analysis').length;

  const open = (record: StudyRecord) => {
    const { upload, sample } = record;
    if (sample) {
      update({
        studyId: sample.id, fileName: `${sample.id.toLowerCase()}.edf`, format: 'edf', sampleRate: 250, lead: 'Lead II',
        age: sample.age, sex: sample.sex === 'M' ? 'Male' : 'Female', bmi: sample.id === 'REC-8842-PT' ? '29.8' : '', severity: sample.severity,
        apneaBurden: sample.burden, apneaMinutes: sample.apneaMinutes, noEventMinutes: sample.clearMinutes, duration: sample.duration,
        metadata: 'Sample record · illustrative values', status: sample.status === 'Processing' ? 'processing' : 'ready',
        progress: sample.progress ?? 100, events: makeEvents(sample.total), summaryMetrics: sample.metrics,
        reportStatus: sample.status === 'Approved' ? 'Approved' : 'Draft', uploadId: null, patientId: null,
      });
      router.push(sample.status === 'Processing' ? '/processing' : sample.status === 'Approved' ? '/summary' : '/detail');
      return;
    }
    if (!upload) return;
    update({
      studyId: record.id, fileName: upload.originalFilename, format: formatOf(upload.originalFilename), sampleRate: upload.samplingRateHz, lead: upload.leadConfiguration ?? '',
      age: upload.ageYears != null ? String(upload.ageYears) : '', sex: sexLabel(upload.sex), bmi: upload.bmi != null ? String(upload.bmi) : '', severity: 'Pending',
      apneaBurden: '', apneaMinutes: '', noEventMinutes: '', duration: '',
      metadata: 'Stored upload · analysis not connected', status: 'ready', progress: 100, events: [], summaryMetrics: null, reportStatus: 'Draft', uploadId: upload.id, patientId: upload.patientId,
    });
    router.push('/detail');
  };
  const hasActiveStudy = Boolean(study.studyId && study.status !== 'empty');
  const continuePath = study.status === 'processing' || study.status === 'failed' ? '/processing' : '/detail';
  const beginNew = () => { reset(); router.push('/upload'); };

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <View style={[styles.greetingRow, wide && styles.greetingRowWide]}>
      <View style={styles.greeting}><Text style={styles.title}>Welcome, {displayName}</Text><Text style={styles.copy}>{loading ? 'Loading your studies…' : `${records.length} stored ${records.length === 1 ? 'study' : 'studies'} · ${awaiting} awaiting analysis`}</Text></View>
      <View style={[styles.searchActions, wide && styles.searchActionsWide]}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search study ID" placeholderTextColor={colors.muted} style={styles.search} accessibilityLabel="Search study ID" />
        <Pressable accessibilityRole="button" onPress={beginNew} style={styles.secondaryStart}><Text style={styles.secondaryStartText}>+ Start new study</Text></Pressable>
      </View>
    </View>

    <View style={[styles.columns, wide && styles.columnsWide]}>
      <View style={styles.mainColumn}>
        {hasActiveStudy ? <GlassPanel style={styles.continueCard}>
          <View style={styles.continueCopy}><Text style={styles.sectionTitle}>Continue where you left off</Text><Text style={styles.copy}>{study.studyId} · {study.status === 'processing' ? 'Processing' : 'Detail'} · Report {study.reportStatus.toLowerCase()}</Text></View>
          <AppButton onPress={() => router.push(continuePath as never)} style={styles.continueButton}><Text style={styles.continueButtonText}>Continue review</Text></AppButton>
        </GlassPanel> : null}

        <GlassPanel style={styles.studiesPanel}>
          <View style={styles.studiesHeading}><Text style={styles.sectionTitle}>Studies</Text></View>
          <View style={styles.filters}>{filters.map((item) => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ selected: filter === item.label }} onPress={() => setFilter(item.label)} style={[styles.filter, filter === item.label && styles.filterActive]}><Text style={[styles.filterText, filter === item.label && styles.filterTextActive]}>{item.label} {item.count}</Text></Pressable>)}</View>
          {deleted ? <View accessibilityRole="alert" style={styles.toast}><Text style={styles.toastText}>{deleted.code} deleted</Text><View style={styles.toastActions}><Pressable accessibilityRole="button" onPress={() => { void undo(); }} style={styles.toastButton}><Text style={styles.toastUndo}>Undo</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setDeleted(null)} style={styles.toastButton}><Text style={styles.toastText}>✕</Text></Pressable></View></View> : null}
          {actionError ? <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text> : null}
          <View style={styles.recordList}>
            {loading ? <ActivityIndicator color={colors.accent} />
              : loadError ? <Text accessibilityRole="alert" style={styles.empty}>Could not load studies: {loadError}</Text>
              : visible.length ? visible.map((record) => <StudyRow key={record.upload?.id ?? record.id} record={record} compact={!wide} onPress={() => open(record)} canDelete={Boolean(record.upload) && record.upload?.clinicianId === myId} confirming={Boolean(record.upload) && confirmId === record.upload?.id} busy={Boolean(record.upload) && busyId === record.upload?.id} onAskDelete={() => setConfirmId(record.upload?.id ?? null)} onCancelDelete={() => setConfirmId(null)} onDelete={() => { void remove(record); }} />)
              : <Text style={styles.empty}>{records.length ? 'No studies match this search and filter.' : 'No studies yet. Press "+ Start new study" to upload your first ECG recording.'}</Text>}
          </View>
        </GlassPanel>
      </View>

      <View style={[styles.sideColumn, wide && styles.sideColumnWide]}>
        <GlassPanel style={styles.sidePanel}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.kpiGrid}>
            <Kpi value={String(records.length)} label="Stored studies" />
            <Kpi value={String(awaiting)} label="Awaiting analysis" />
          </View>
          <Text style={styles.subCopy}>Severity and apnea burden appear once the analysis model is connected.</Text>
        </GlassPanel>
        <GlassPanel style={styles.sidePanel}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <View style={styles.activityList}>{records.slice(0, 5).map((record) => <View key={record.upload?.id ?? record.id} style={styles.activityRow}><Text style={styles.activityTitle}>Uploaded {record.id}</Text><Text style={styles.activityTime}>{record.ago}</Text></View>)}{!records.length && !loading ? <Text style={styles.subCopy}>Nothing yet.</Text> : null}</View>
        </GlassPanel>
        <GlassPanel style={styles.sidePanel}>
          <View style={styles.logHead}><Text style={styles.sectionTitle}>Deletion log</Text><Pressable accessibilityRole="link" onPress={() => router.push('/activity' as never)} style={styles.logAll}><Text selectable={false} style={styles.logAllText}>View all</Text></Pressable></View>
          <View style={styles.activityList}>{recentLog.length ? recentLog.map((e) => <View key={e.id} style={styles.activityRow}><Text style={styles.activityTitle}>{e.actorIsMe ? 'You' : e.actorName} {e.action === 'soft_delete' ? 'deleted' : 'restored'} {e.recordCode ?? 'a study'}</Text><Text style={styles.activityTime}>{timeAgo(e.createdAt)}</Text></View>) : <Text style={styles.subCopy}>No deletions.</Text>}</View>
        </GlassPanel>
      </View>
    </View>
  </ScrollView>;
}

type RowActions = { canDelete: boolean; confirming: boolean; busy: boolean; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void };
function StudyRow({ record, compact, onPress, canDelete, confirming, busy, onAskDelete, onCancelDelete, onDelete }: { record: StudyRecord; compact: boolean; onPress: () => void } & RowActions) {
  if (confirming) {
    return <View accessibilityRole="alert" style={[styles.studyRow, styles.confirmRow, compact && styles.studyRowCompact]}>
      <View style={styles.identity}><Text style={styles.studyId}>Delete {record.id}?</Text><Text style={styles.subCopy}>It will disappear from your list. You can undo right after.</Text></View>
      <View style={styles.confirmActions}>
        <Pressable accessibilityRole="button" onPress={onCancelDelete} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onDelete} style={[styles.confirmDelete, busy && styles.pressed]}><Text style={styles.confirmDeleteText}>{busy ? 'Deleting…' : 'Delete'}</Text></Pressable>
      </View>
    </View>;
  }
  return <View style={styles.rowWrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${record.id}, ${record.age} years, ${record.sex}, ${record.detail}, ${record.status}, ${record.ago}. Click for more detail.`} onPress={onPress} style={({ pressed }) => [styles.rowPress, styles.rowMain, pressed && styles.pressed]}>
      <View style={[styles.studyRow, compact && styles.studyRowCompact]}>
        <View style={styles.identity}><View style={styles.idRow}><Text style={styles.studyId}>{record.id}</Text>{record.sample ? <Text style={styles.sampleTag}>SAMPLE</Text> : null}</View><Text style={styles.subCopy}>{record.age} y · {record.sex} · {record.detail}</Text></View>
        {record.sample ? <View style={[styles.severityBadge, record.sample.severity === 'Severe OSA' && styles.severeBadge, record.sample.severity === 'Moderate' && styles.moderateBadge, record.sample.severity === 'Mild / Normal' && styles.mildBadge, record.sample.severity === 'Pending' && styles.pendingBadge]}><Text style={[styles.severityText, record.sample.severity !== 'Pending' && styles.badgeDark]}>{record.sample.severity === 'Severe OSA' ? '▲' : record.sample.severity === 'Moderate' ? '◆' : record.sample.severity === 'Mild / Normal' ? '✓' : '○'} {record.sample.severity}{record.sample.burden ? ` · ${record.sample.burden}` : ''}</Text></View>
          : <View style={[styles.severityBadge, styles.pendingBadge]}><Text style={styles.severityText}>○ Pending</Text></View>}
        <View style={styles.statusBlock}><Text style={styles.rowStatus}>{record.sample ? (record.status === 'Processing' ? `Processing ${record.sample.progress ?? 0}%` : record.status === 'Approved' ? 'Report approved' : 'Report needs review') : record.status}</Text><View style={styles.rowProgress}><View style={[styles.rowProgressFill, { width: record.status === 'Awaiting analysis' ? '0%' : '100%' }]} /></View></View>
        <View style={styles.reviewBlock}><Text style={styles.reviewText}>{record.sample ? `${record.sample.total} apnea events` : 'Stored'}</Text><Text style={styles.subCopy}>{record.ago}</Text></View>
      </View>
    </Pressable>
    {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.id}`} onPress={onAskDelete} style={({ pressed }) => [styles.trash, pressed && styles.pressed]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
    </Pressable> : null}
  </View>;
}

function Kpi({ value, label }: { value: string; label: string }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sampleTag: { color: colors.accentText, backgroundColor: '#FFD166', fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  logHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, logAll: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6, cursor: 'pointer' } as never, logAllText: { color: colors.accent, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  rowWrap: { flexDirection: 'row', alignItems: 'stretch', gap: 6 }, rowMain: { flex: 1 },
  trash: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(2,3,58,0.42)' },
  confirmRow: { borderWidth: 1, borderColor: colors.coral },
  confirmActions: { flexDirection: 'row', gap: 8 },
  confirmCancel: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  confirmCancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  confirmDelete: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.coral },
  confirmDeleteText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border },
  toastText: { color: colors.text, fontSize: 14 }, toastActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toastButton: { minHeight: 40, minWidth: 40, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  toastUndo: { color: colors.accent, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  actionError: { color: colors.accentText, fontSize: 14, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  scroll: { flex: 1 }, page: { width: '100%', maxWidth: 1480, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 112, gap: 16 },
  greetingRow: { gap: 14 }, greetingRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, greeting: { gap: 2 }, title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800' }, copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  searchActions: { gap: 8 }, searchActionsWide: { flexDirection: 'row', alignItems: 'center' }, search: { minHeight: 48, minWidth: 220, flex: 1, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(2,3,58,0.56)', color: colors.text, fontSize: 14, fontFamily: fonts.regular }, secondaryStart: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(2,3,58,0.25)' }, secondaryStartText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  columns: { gap: 14 }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1, minWidth: 0, gap: 14 }, sideColumn: { gap: 14 }, sideColumnWide: { width: 320 },
  continueCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderColor: 'rgba(144,224,239,0.7)' }, continueCopy: { flex: 1, minWidth: 220, gap: 3 }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, progressTrack: { width: '100%', maxWidth: 420, height: 10, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(202,240,248,0.24)', marginTop: 5 }, progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.accent }, continueButton: { minHeight: 48, paddingHorizontal: 20 }, continueButtonText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  studiesPanel: { gap: 14 }, studiesHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(202,240,248,0.13)' }, filterActive: { backgroundColor: colors.accent }, filterText: { color: colors.text, fontSize: 14, fontWeight: '700' }, filterTextActive: { color: colors.accentText }, recordList: { gap: 8 }, rowPress: { borderRadius: 18 }, pressed: { opacity: 0.84 },
  studyRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(2,3,58,0.42)' }, studyRowCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 9 }, identity: { flex: 1, minWidth: 120 }, studyId: { color: colors.text, fontSize: 16, fontWeight: '800' }, subCopy: { color: colors.muted, fontSize: 14 }, severityBadge: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' }, severityText: { color: colors.accentText, fontSize: 14, fontWeight: '800' }, badgeDark: { color: colors.accentText }, severeBadge: { backgroundColor: colors.coral }, moderateBadge: { backgroundColor: '#FFD166' }, mildBadge: { backgroundColor: colors.accent }, pendingBadge: { borderStyle: 'dashed', borderColor: colors.text, backgroundColor: 'transparent' },
  statusBlock: { width: 140, gap: 4 }, rowStatus: { color: colors.text, fontSize: 14 }, rowProgress: { height: 7, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(202,240,248,0.24)' }, rowProgressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.accent }, reviewBlock: { minWidth: 116, gap: 2 }, reviewText: { color: colors.text, fontSize: 14 }, empty: { color: colors.text, fontSize: 14, padding: 10 },
  sidePanel: { gap: 12 }, kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, kpi: { width: '48%', minHeight: 86, justifyContent: 'center', padding: 12, borderRadius: 18, backgroundColor: 'rgba(2,3,58,0.44)' }, kpiValue: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: '800' }, kpiLabel: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  mixBar: { height: 18, flexDirection: 'row', overflow: 'hidden', borderRadius: 99 }, mixSevere: { backgroundColor: colors.coral }, mixModerate: { backgroundColor: '#FFD166' }, mixMild: { backgroundColor: colors.accent }, mixPending: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, legendItem: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6 }, legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 }, dashed: { borderStyle: 'dashed' }, legendText: { color: colors.text, fontSize: 14 },
  activityList: { gap: 10 }, activityRow: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, activityTitle: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 }, activityTime: { color: colors.muted, fontSize: 14, textAlign: 'right' },
});
