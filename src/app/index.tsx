import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton, GlassPanel, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { cancelOfflineSignalDownloads } from '@/lib/inference';
import { clearStudyOfflineCache, readRecentUploadsCache, removeRecentUploadFromCache, writeRecentUploadsCache } from '@/lib/offline-cache';
import { getDeletionLog, listRecentEcgUploads, restoreEcgUpload, softDeleteEcgUpload, timeAgo, type DeletionLogEntry, type RecentEcgUpload } from '@/lib/queries';

type StudyStatus = 'Awaiting analysis' | 'Processing' | 'Analysis complete' | 'Failed';
type StudyRecord = { id: string; status: StudyStatus; age: string; sex: string; detail: string; ago: string; upload: RecentEcgUpload };

const statusOf = (upload: RecentEcgUpload): StudyStatus => {
  if (upload.latestRun?.status === 'processing' || upload.latestRun?.status === 'queued' || upload.status === 'processing') return 'Processing';
  if (upload.latestRun?.status === 'failed' || upload.status === 'failed') return 'Failed';
  if (upload.latestRun?.status === 'completed' || upload.status === 'completed') return 'Analysis complete';
  return 'Awaiting analysis';
};

function toRecord(upload: RecentEcgUpload): StudyRecord {
  return {
    id: upload.recordCode, status: statusOf(upload), upload, ago: timeAgo(upload.createdAt),
    age: upload.ageYears != null ? String(upload.ageYears) : '—', sex: sexLabel(upload.sex) || '—',
    detail: [upload.samplingRateHz ? `${upload.samplingRateHz} Hz` : null, upload.leadConfiguration].filter(Boolean).join(' · ') || 'Signal settings unavailable',
  };
}

const sexLabel = (value: string | null) => value === 'unspecified' ? 'Unknown' : value ? value[0].toUpperCase() + value.slice(1) : '';

const filterLabels = ['All', 'Awaiting analysis', 'Processing', 'Analysis complete', 'Failed'] as const;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const { session } = useAuth();
  const displayName: string = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';
  const { study, update, reset } = useUploadState();
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showingOfflineRecords, setShowingOfflineRecords] = useState(false);
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
    const load = async () => {
      const cached = myId ? await readRecentUploadsCache(myId).catch(() => null) : null;
      if (cancelled) return;
      if (cached) {
        setRecords(cached.map(toRecord));
        setLoadError('');
        setShowingOfflineRecords(true);
        setLoading(false);
      }
      try {
        const rows = await listRecentEcgUploads(50);
        if (cancelled) return;
        setRecords(rows.map(toRecord));
        setLoadError('');
        setShowingOfflineRecords(false);
        if (myId) void writeRecentUploadsCache(myId, rows).catch(() => {});
      } catch (reason) {
        if (!cancelled) {
          if (!cached) {
            setLoadError(reason instanceof Error ? reason.message : 'Could not load studies.');
            setShowingOfflineRecords(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey, myId]);

  const messageOf = (reason: unknown, fallback: string) => typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : fallback;
  const remove = async (record: StudyRecord) => {
    const upload = record.upload;
    if (!upload) return;
    setBusyId(upload.id);
    setActionError('');
    try {
      await softDeleteEcgUpload(upload.id);
      if (myId) cancelOfflineSignalDownloads(myId, upload.id);
      if (myId) await clearStudyOfflineCache(myId, upload.id).catch(() => {});
      if (myId) await removeRecentUploadFromCache(myId, upload.id).catch(() => {});
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

  const allRecords = records;
  const filters = filterLabels
    .map((label) => ({ label, count: label === 'All' ? allRecords.length : allRecords.filter((record) => record.status === label).length }))
    .filter((item) => item.label === 'All' || item.count > 0 || item.label === filter);
  const visible = useMemo(() => allRecords.filter((record) => (filter === 'All' || record.status === filter) && `${record.id} ${record.status}`.toLowerCase().includes(query.trim().toLowerCase())), [allRecords, filter, query]);
  const awaiting = records.filter((record) => record.status === 'Awaiting analysis').length;

  const open = (record: StudyRecord) => {
    const { upload } = record;
    const run = upload.latestRun;
    const status = run?.status === 'completed' || upload.status === 'completed' ? 'ready'
      : run?.status === 'processing' || run?.status === 'queued' || upload.status === 'processing' ? 'processing'
        : run?.status === 'failed' || upload.status === 'failed' ? 'failed' : 'uploaded';
    update({
      studyId: record.id, fileName: upload.originalFilename, format: 'wfdb', sampleRate: upload.samplingRateHz, lead: upload.leadConfiguration ?? '',
      age: upload.ageYears != null ? String(upload.ageYears) : '', sex: sexLabel(upload.sex), bmi: upload.bmi != null ? String(upload.bmi) : '',
      metadata: 'Private WFDB recording', status, progress: run?.progress_percent ?? 0,
      reportStatus: 'Draft', uploadId: upload.id, patientId: upload.patientId,
      durationSeconds: upload.durationSeconds ?? (run?.total_minutes ?? 0) * 60, runId: run?.id ?? null, errorMessage: run?.error_message ?? '',
    });
    router.push(status === 'ready' ? '/detail' : '/processing');
  };
  const hasActiveStudy = Boolean(study.studyId && study.status !== 'empty');
  const continuePath = study.status === 'processing' || study.status === 'failed' ? '/processing' : '/detail';
  const beginNew = () => { reset(); router.push('/upload'); };

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <View style={[styles.greetingRow, wide && styles.greetingRowWide]}>
      <View style={styles.greeting}><Text style={styles.title}>Welcome, {displayName}</Text><Text style={styles.copy}>{loading ? 'Loading your studies…' : `${records.length} stored ${records.length === 1 ? 'study' : 'studies'} · ${awaiting} awaiting analysis`}</Text>{showingOfflineRecords ? <Text style={styles.subCopy}>Showing studies saved on this device; their latest status may be out of date.</Text> : null}</View>
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
        <View style={styles.identity}><Text style={styles.studyId}>{record.id}</Text><Text style={styles.subCopy}>{record.age} y · {record.sex} · {record.detail}</Text></View>
        <View style={[styles.statusBadge, styles.pendingBadge]}><Text style={styles.statusBadgeText}>{record.status}</Text></View>
        <View style={styles.statusBlock}><Text style={styles.rowStatus}>{record.status}</Text><View style={styles.rowProgress}><View style={[styles.rowProgressFill, { width: `${record.upload.latestRun?.progress_percent ?? (record.status === 'Analysis complete' ? 100 : 0)}%` }]} /></View></View>
        <View style={styles.reviewBlock}><Text style={styles.reviewText}>{record.upload.latestRun?.status === 'completed' ? `${record.upload.latestRun.apnea_minutes ?? 0} / ${record.upload.latestRun.total_minutes ?? 0} apnea minutes` : 'WFDB recording'}</Text><Text style={styles.subCopy}>{record.ago}</Text></View>
      </View>
    </Pressable>
    {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.id}`} onPress={onAskDelete} style={({ pressed }) => [styles.trash, pressed && styles.pressed]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
    </Pressable> : null}
  </View>;
}

function Kpi({ value, label }: { value: string; label: string }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
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
  studyRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(2,3,58,0.42)' }, studyRowCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 9 }, identity: { flex: 1, minWidth: 120 }, studyId: { color: colors.text, fontSize: 16, fontWeight: '800' }, subCopy: { color: colors.muted, fontSize: 14 }, statusBadge: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' }, statusBadgeText: { color: colors.text, fontSize: 14, fontWeight: '800' }, pendingBadge: { borderStyle: 'dashed', borderColor: colors.text, backgroundColor: 'transparent' },
  statusBlock: { width: 140, gap: 4 }, rowStatus: { color: colors.text, fontSize: 14 }, rowProgress: { height: 7, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(202,240,248,0.24)' }, rowProgressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.accent }, reviewBlock: { minWidth: 116, gap: 2 }, reviewText: { color: colors.text, fontSize: 14 }, empty: { color: colors.text, fontSize: 14, padding: 10 },
  sidePanel: { gap: 12 }, kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, kpi: { width: '48%', minHeight: 86, justifyContent: 'center', padding: 12, borderRadius: 18, backgroundColor: 'rgba(2,3,58,0.44)' }, kpiValue: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: '800' }, kpiLabel: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  mixBar: { height: 18, flexDirection: 'row', overflow: 'hidden', borderRadius: 99 }, mixSevere: { backgroundColor: colors.coral }, mixModerate: { backgroundColor: '#FFD166' }, mixMild: { backgroundColor: colors.accent }, mixPending: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, legendItem: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6 }, legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 }, dashed: { borderStyle: 'dashed' }, legendText: { color: colors.text, fontSize: 14 },
  activityList: { gap: 10 }, activityRow: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, activityTitle: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 }, activityTime: { color: colors.muted, fontSize: 14, textAlign: 'right' },
});
