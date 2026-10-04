import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';
import { getDeletionLog, timeAgo, type DeletionLogEntry } from '@/lib/queries';

const filters = ['All', 'Deleted', 'Restored'] as const;
const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

// Deletion log: every delete / restore of a study, for all patients this
// clinician is attached to — including actions by other clinicians who share
// those patients. Entries come from audit_log and cannot be edited or removed.
export default function ActivityScreen() {
  const [entries, setEntries] = useState<DeletionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getDeletionLog(500)
      .then((rows) => { if (!cancelled) { setEntries(rows); setError(''); } })
      .catch((reason) => { if (!cancelled) setError(typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not load the log.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const visible = useMemo(() => entries.filter((e) => filter === 'All' || (filter === 'Deleted' ? e.action === 'soft_delete' : e.action === 'restore')), [entries, filter]);
  const stillDeleted = new Set(entries.filter((e) => e.currentlyDeleted).map((e) => e.uploadId)).size;

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="RECORDS" title="Deletion log" description="Every study that was deleted or restored, for all patients you are attached to — including actions by other clinicians who share those patients. Entries cannot be edited or removed." />

    <View style={styles.stats}>
      <GlassPanel style={styles.stat}><Text style={styles.statLabel}>Deletions</Text><Text style={styles.statValue}>{entries.filter((e) => e.action === 'soft_delete').length}</Text></GlassPanel>
      <GlassPanel style={styles.stat}><Text style={styles.statLabel}>Restores</Text><Text style={styles.statValue}>{entries.filter((e) => e.action === 'restore').length}</Text></GlassPanel>
      <GlassPanel style={styles.stat}><Text style={styles.statLabel}>Studies still deleted</Text><Text style={styles.statValue}>{stillDeleted}</Text></GlassPanel>
    </View>

    <GlassPanel style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.filters}>{filters.map((f) => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterActive]}><Text selectable={false} style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text></Pressable>)}</View>
        <AppButton variant="quiet" compact onPress={() => { setLoading(true); setReloadKey((k) => k + 1); }}><Text style={styles.link}>Refresh</Text></AppButton>
      </View>
      {loading ? <ActivityIndicator color={colors.accent} />
        : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        : visible.length ? visible.map((e, index) => <LogRow key={e.id} entry={e} divider={index > 0} />)
        : <Text style={styles.empty}>{entries.length ? 'Nothing matches this filter.' : 'No studies have been deleted.'}</Text>}
    </GlassPanel>

    <AppButton variant="quiet" onPress={() => router.push('/')} style={styles.back}><Text style={styles.link}>Back to Home</Text></AppButton>
  </ScrollView>;
}

function LogRow({ entry, divider }: { entry: DeletionLogEntry; divider: boolean }) {
  const deleted = entry.action === 'soft_delete';
  const who = entry.actorIsMe ? 'You' : entry.actorName;
  return <View style={[styles.row, divider && styles.divider]}>
    <View style={[styles.icon, deleted ? styles.iconDeleted : styles.iconRestored]}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.accentText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {deleted ? <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /> : <Path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" />}
      </Svg>
    </View>
    <View style={styles.rowCopy}>
      <Text style={styles.rowTitle}>{who} {deleted ? 'deleted' : 'restored'} {entry.recordCode ?? 'a study'}</Text>
      <Text style={styles.rowMeta}>Patient {entry.subjectCode ?? '—'} · {whenLabel(entry.createdAt)} · {timeAgo(entry.createdAt)}</Text>
    </View>
    <View style={[styles.pill, entry.currentlyDeleted ? styles.pillDeleted : styles.pillOk]}><Text selectable={false} style={[styles.pillText, entry.currentlyDeleted && styles.pillTextDark]}>{entry.currentlyDeleted ? 'Still deleted' : 'Visible'}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 106, gap: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flex: 1, minWidth: 150, gap: 4 }, statLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' }, statValue: { color: colors.text, fontSize: 26, fontWeight: '800' },
  panel: { gap: 4 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(202,240,248,0.13)' },
  filterActive: { backgroundColor: colors.accent }, filterText: { color: colors.text, fontSize: 14, fontWeight: '700' }, filterTextActive: { color: colors.accentText },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconDeleted: { backgroundColor: colors.coral }, iconRestored: { backgroundColor: colors.accent },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: colors.muted, fontSize: 13 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  pillDeleted: { backgroundColor: colors.coral, borderColor: colors.coral }, pillOk: { borderColor: colors.border },
  pillText: { color: colors.text, fontSize: 12, fontWeight: '800' }, pillTextDark: { color: colors.accentText },
  empty: { color: colors.text, fontSize: 14, padding: 10 },
  error: { color: colors.accentText, fontSize: 14, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  link: { color: colors.text, fontSize: 14, fontWeight: '700' },
  back: { alignSelf: 'flex-end' },
});
