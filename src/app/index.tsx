import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { AppButton, GlassPanel, PosaText as Text } from '@/components/posa-ui';
import { sampleEvents, useUploadState, type ApneaEvent, type SummaryMetrics } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';

type StudyStatus = 'Needs review' | 'Processing' | 'Approved';
type StudyRecord = { id: string; status: StudyStatus; age: string; sex: string; duration: string; severity: string; burden: string; total: number; ago: string; progress?: number; apneaMinutes: string; clearMinutes: string; metrics: SummaryMetrics | null };

const records: StudyRecord[] = [
  { id: 'REC-8842-PT', status: 'Needs review', age: '54', sex: 'M', duration: '08:30:00', severity: 'Severe OSA', burden: '47.2%', total: 17, ago: '10 min ago', apneaMinutes: '240', clearMinutes: '268', metrics: { rPeakCount: 41820, annotationRuns: 9, medianHrBpm: 82, sdnnMs: 87, rmssdMs: 45, validRrPercent: 100 } },
  { id: 'REC-8841-KL', status: 'Needs review', age: '61', sex: 'M', duration: '08:12:00', severity: 'Severe OSA', burden: '49.3%', total: 19, ago: '42 min ago', apneaMinutes: '242', clearMinutes: '250', metrics: null },
  { id: 'REC-8839-MN', status: 'Needs review', age: '47', sex: 'F', duration: '07:48:00', severity: 'Severe OSA', burden: '47.6%', total: 15, ago: '1 h 15 min ago', apneaMinutes: '223', clearMinutes: '245', metrics: null },
  { id: 'REC-8845-QA', status: 'Processing', age: '58', sex: 'M', duration: '08:00:00', severity: 'Pending', burden: '', total: 19, ago: '8 min ago', progress: 62, apneaMinutes: '', clearMinutes: '', metrics: null },
  { id: 'REC-8827-TS', status: 'Approved', age: '66', sex: 'M', duration: '07:30:00', severity: 'Moderate', burden: '31.0%', total: 12, ago: 'Yesterday', apneaMinutes: '140', clearMinutes: '310', metrics: null },
  { id: 'REC-8829-RX', status: 'Approved', age: '39', sex: 'F', duration: '07:18:00', severity: 'Mild / Normal', burden: '16.6%', total: 4, ago: '5 h 20 min ago', apneaMinutes: '73', clearMinutes: '365', metrics: null },
];
const filters = [
  { label: 'All', count: 6 }, { label: 'Needs review', count: 3 }, { label: 'Processing', count: 1 }, { label: 'Approved', count: 2 },
] as const;
const activity = [
  { title: 'Uploaded REC-8845-QA', time: '8 min ago' },
  { title: 'Processing finished REC-8841-KL', time: '42 min ago' },
  { title: 'Report approved REC-8829-RX', time: '5 h 20 min ago' },
];

function makeEvents(count: number): ApneaEvent[] {
  return Array.from({ length: count }, (_, index) => ({ ...sampleEvents[index % sampleEvents.length], id: index + 1 }));
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const { study, update, reset } = useUploadState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]['label']>('All');
  const visible = useMemo(() => records.filter((record) => (filter === 'All' || record.status === filter) && `${record.id} ${record.severity} ${record.status}`.toLowerCase().includes(query.trim().toLowerCase())), [filter, query]);
  const open = (record: StudyRecord) => {
    update({
      studyId: record.id, fileName: `${record.id.toLowerCase()}.edf`, format: 'edf', sampleRate: 250, lead: 'Lead II',
      age: record.age, sex: record.sex === 'M' ? 'Male' : 'Female', bmi: record.id === 'REC-8842-PT' ? '29.8' : '', severity: record.severity,
      apneaBurden: record.burden, apneaMinutes: record.apneaMinutes, noEventMinutes: record.clearMinutes, duration: record.duration,
      metadata: 'Sample record · illustrative values', status: record.status === 'Processing' ? 'processing' : 'ready',
      progress: record.progress ?? 100, events: makeEvents(record.total), summaryMetrics: record.metrics,
      reportStatus: record.status === 'Approved' ? 'Approved' : 'Draft',
    });
    router.push(record.status === 'Processing' ? '/processing' : record.status === 'Approved' ? '/summary' : '/detail');
  };
  const activeRecord = records.find((record) => record.id === study.studyId);
  const hasActiveStudy = Boolean(study.studyId && study.status !== 'empty');
  const continueRecord = activeRecord ?? records[0];
  const continuePath = study.status === 'processing' || study.status === 'failed' ? '/processing' : study.status === 'ready' && study.reportStatus === 'Approved' ? '/summary' : '/detail';
  const beginNew = () => { reset(); router.push('/upload'); };

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <View style={[styles.greetingRow, wide && styles.greetingRowWide]}>
      <View style={styles.greeting}><Text style={styles.title}>Good evening, Dr. Thorne</Text><Text style={styles.copy}>3 studies need your review · 1 is still processing</Text></View>
      <View style={[styles.searchActions, wide && styles.searchActionsWide]}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search study ID" placeholderTextColor={colors.muted} style={styles.search} accessibilityLabel="Search study ID" />
        <Pressable accessibilityRole="button" onPress={beginNew} style={styles.secondaryStart}><Text style={styles.secondaryStartText}>+ Start new study</Text></Pressable>
      </View>
    </View>

    <View style={[styles.columns, wide && styles.columnsWide]}>
      <View style={styles.mainColumn}>
        <GlassPanel style={styles.continueCard}>
          <View style={styles.continueCopy}><Text style={styles.sectionTitle}>Continue where you left off</Text><Text style={styles.copy}>{hasActiveStudy ? `${study.studyId} · ${study.status === 'processing' ? 'Processing' : 'Detail'} · ${study.events.length} apnea events · Report ${study.reportStatus.toLowerCase()}` : `${continueRecord.id} · Detail · ${continueRecord.total} apnea events · Report draft`}</Text>
            <View accessibilityRole="progressbar" accessibilityLabel="Analysis progress" accessibilityValue={{ min: 0, max: 100, now: hasActiveStudy ? study.status === 'ready' ? 100 : study.progress : 100 }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${hasActiveStudy ? study.status === 'ready' ? 100 : study.progress : 100}%` }]} /></View>
          </View>
          <AppButton onPress={() => hasActiveStudy ? router.push(continuePath as never) : open(continueRecord)} style={styles.continueButton}><Text style={styles.continueButtonText}>Continue review</Text></AppButton>
        </GlassPanel>

        <GlassPanel style={styles.studiesPanel}>
          <View style={styles.studiesHeading}><Text style={styles.sectionTitle}>Studies</Text></View>
          <View style={styles.filters}>{filters.map((item) => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ selected: filter === item.label }} onPress={() => setFilter(item.label)} style={[styles.filter, filter === item.label && styles.filterActive]}><Text style={[styles.filterText, filter === item.label && styles.filterTextActive]}>{item.label} {item.count}</Text></Pressable>)}</View>
          <View style={styles.recordList}>
            {visible.length ? visible.map((record) => <StudyRow key={record.id} record={record} compact={!wide} onPress={() => open(record)} />) : <Text style={styles.empty}>No studies match this search and filter.</Text>}
          </View>
        </GlassPanel>
      </View>

      <View style={[styles.sideColumn, wide && styles.sideColumnWide]}>
        <GlassPanel style={styles.sidePanel}>
          <Text style={styles.sectionTitle}>This week</Text>
          <View style={styles.kpiGrid}>
            <Kpi value="3" label="Awaiting review" /> <Kpi value="3" label="Severe cases" />
            <Kpi value="12" label="Approved" /> <Kpi value="38%" label="Avg apnea burden" />
          </View>
        </GlassPanel>
        <GlassPanel style={styles.sidePanel}>
          <Text style={styles.sectionTitle}>Severity mix</Text>
          <View accessibilityRole="image" accessibilityLabel="Severity distribution: 3 severe, 1 moderate, 1 mild or normal, 1 pending" style={styles.mixBar}>
            <View style={[styles.mixSevere, { flex: 3 }]} /><View style={[styles.mixModerate, { flex: 1 }]} /><View style={[styles.mixMild, { flex: 1 }]} /><View style={[styles.mixPending, { flex: 1 }]} />
          </View>
          <View style={styles.legend}><Legend color={colors.coral} text="Severe 3" /><Legend color="#FFD166" text="Moderate 1" /><Legend color={colors.accent} text="Mild / Normal 1" /><Legend color={colors.text} text="Pending 1" dashed /></View>
        </GlassPanel>
        <GlassPanel style={styles.sidePanel}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <View style={styles.activityList}>{activity.map((item) => <View key={item.title} style={styles.activityRow}><Text style={styles.activityTitle}>{item.title}</Text><Text style={styles.activityTime}>{item.time}</Text></View>)}</View>
        </GlassPanel>
      </View>
    </View>
  </ScrollView>;
}

function StudyRow({ record, compact, onPress }: { record: StudyRecord; compact: boolean; onPress: () => void }) {
  const ratio = record.status === 'Processing' ? (record.progress ?? 0) : 100;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${record.id}, ${record.age} years, ${record.sex}, ${record.duration}, ${record.severity}, ${record.status}, ${record.total} apnea events, ${record.ago}. Click for more detail.`} onPress={onPress} style={({ pressed }) => [styles.rowPress, pressed && styles.pressed]}>
    <View style={[styles.studyRow, compact && styles.studyRowCompact]}>
      <View style={styles.identity}><Text style={styles.studyId}>{record.id}</Text><Text style={styles.subCopy}>{record.age} y · {record.sex} · {record.duration}</Text></View>
      <View style={[styles.severityBadge, record.severity === 'Severe OSA' && styles.severeBadge, record.severity === 'Moderate' && styles.moderateBadge, record.severity === 'Mild / Normal' && styles.mildBadge, record.severity === 'Pending' && styles.pendingBadge]}><Text style={[styles.severityText, record.severity !== 'Pending' && styles.badgeDark]}>{record.severity === 'Severe OSA' ? '▲' : record.severity === 'Moderate' ? '◆' : record.severity === 'Mild / Normal' ? '✓' : '○'} {record.severity}{record.burden ? ` · ${record.burden}` : ''}</Text></View>
      <View style={styles.statusBlock}><Text style={styles.rowStatus}>{record.status === 'Processing' ? `Processing ${record.progress}%` : record.status === 'Approved' ? 'Report approved' : 'Report needs review'}</Text><View style={styles.rowProgress}><View style={[styles.rowProgressFill, { width: `${ratio}%` }]} /></View></View>
      <View style={styles.reviewBlock}><Text style={styles.reviewText}>{record.total} apnea events</Text><Text style={styles.subCopy}>{record.ago}</Text></View>
    </View>
  </Pressable>;
}

function Kpi({ value, label }: { value: string; label: string }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }
function Legend({ color, text, dashed = false }: { color: string; text: string; dashed?: boolean }) { return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: dashed ? 'transparent' : color, borderColor: color }, dashed && styles.dashed]} /><Text style={styles.legendText}>{text}</Text></View>; }

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
