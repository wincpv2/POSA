import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton, GlassPanel, PosaText as Text } from '@/components/posa-ui';
import { useUploadState, type Study } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { listRecentEcgUploads, timeAgo, type RecentEcgUpload } from '@/lib/queries';

type StudyStatus = 'Awaiting analysis' | 'Processing' | 'Failed';
type StudyRecord = { id: string; status: StudyStatus; age: string; sex: string; detail: string; ago: string; upload: RecentEcgUpload };

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

const filterLabels = ['All', 'Awaiting analysis', 'Processing', 'Failed'] as const;

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

  useEffect(() => {
    let cancelled = false;
    listRecentEcgUploads(50)
      .then((rows) => { if (!cancelled) setRecords(rows.map(toRecord)); })
      .catch((reason) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Could not load studies.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filters = filterLabels.map((label) => ({ label, count: label === 'All' ? records.length : records.filter((record) => record.status === label).length }));
  const visible = useMemo(() => records.filter((record) => (filter === 'All' || record.status === filter) && `${record.id} ${record.status}`.toLowerCase().includes(query.trim().toLowerCase())), [records, filter, query]);
  const awaiting = records.filter((record) => record.status === 'Awaiting analysis').length;

  const open = (record: StudyRecord) => {
    const { upload } = record;
    update({
      studyId: record.id, fileName: upload.originalFilename, format: formatOf(upload.originalFilename), sampleRate: upload.samplingRateHz, lead: upload.leadConfiguration ?? '',
      age: upload.ageYears != null ? String(upload.ageYears) : '', sex: sexLabel(upload.sex), bmi: upload.bmi != null ? String(upload.bmi) : '', severity: 'Pending',
      apneaBurden: '', apneaMinutes: '', noEventMinutes: '', duration: '',
      metadata: 'Stored upload · analysis not connected', status: 'ready', progress: 100, events: [], summaryMetrics: null, reportStatus: 'Draft',
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
          <View style={styles.recordList}>
            {loading ? <ActivityIndicator color={colors.accent} />
              : loadError ? <Text accessibilityRole="alert" style={styles.empty}>Could not load studies: {loadError}</Text>
              : visible.length ? visible.map((record) => <StudyRow key={record.upload.id} record={record} compact={!wide} onPress={() => open(record)} />)
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
          <View style={styles.activityList}>{records.slice(0, 5).map((record) => <View key={record.upload.id} style={styles.activityRow}><Text style={styles.activityTitle}>Uploaded {record.id}</Text><Text style={styles.activityTime}>{record.ago}</Text></View>)}{!records.length && !loading ? <Text style={styles.subCopy}>Nothing yet.</Text> : null}</View>
        </GlassPanel>
      </View>
    </View>
  </ScrollView>;
}

function StudyRow({ record, compact, onPress }: { record: StudyRecord; compact: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${record.id}, ${record.age} years, ${record.sex}, ${record.detail}, ${record.status}, ${record.ago}. Click for more detail.`} onPress={onPress} style={({ pressed }) => [styles.rowPress, pressed && styles.pressed]}>
    <View style={[styles.studyRow, compact && styles.studyRowCompact]}>
      <View style={styles.identity}><Text style={styles.studyId}>{record.id}</Text><Text style={styles.subCopy}>{record.age} y · {record.sex} · {record.detail}</Text></View>
      <View style={[styles.severityBadge, styles.pendingBadge]}><Text style={styles.severityText}>○ Pending</Text></View>
      <View style={styles.statusBlock}><Text style={styles.rowStatus}>{record.status}</Text><View style={styles.rowProgress}><View style={[styles.rowProgressFill, { width: record.status === 'Awaiting analysis' ? '0%' : '100%' }]} /></View></View>
      <View style={styles.reviewBlock}><Text style={styles.reviewText}>Stored</Text><Text style={styles.subCopy}>{record.ago}</Text></View>
    </View>
  </Pressable>;
}

function Kpi({ value, label }: { value: string; label: string }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
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
