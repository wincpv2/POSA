import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, MetricCard, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { listRecentEcgUploads, timeAgo, type RecentEcgUpload } from '@/lib/queries';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1020;
  const desktop = width >= 760;

  const { session } = useAuth();
  const displayName = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';

  const [records, setRecords] = useState<RecentEcgUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listRecentEcgUploads()
      .then((rows) => {
        if (active) setRecords(rows);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load records');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="DIRECT CLINICAL MODE"
        title="Welcome to your sleep lab"
        description="A focused workspace for sleep study intake, signal review, and report handoff."
        badge="Demo environment"
      />

      <Surface style={styles.welcomeCard}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeEyebrow}>SLEEP MEDICINE WORKSPACE</Text>
          <Text style={styles.welcomeTitle}>Good morning, {displayName}</Text>
          <Text style={styles.welcomeText}>Review a sample study or start a new physiological upload.</Text>
        </View>
        <AppButton href="/upload" style={styles.welcomeAction}>
          <Text style={styles.primaryButtonText}>＋  Start a new study</Text>
        </AppButton>
      </Surface>

      <View style={[styles.metricRow, !desktop && styles.metricRowCompact]}>
        <MetricCard label="STUDIES AUDITED" value="70" detail="Example cohort" tone="blue" />
        <MetricCard label="QRS PRECISION" value="99.4%" detail="Prototype metric" tone="mint" />
        <MetricCard label="REFERENCE SET" value="WFDB" detail="PhysioNet format" tone="rose" />
      </View>

      <View style={[styles.lowerGrid, wide && styles.lowerGridWide]}>
        <Surface style={styles.cohortCard}>
          <SectionTitle title="Reference cohort" subtitle="Example workspace configuration" right={<Pill label="WFDB" tone="blue" />} />
          <View style={styles.cohortInfo}>
            <View style={styles.cohortMark}><Text style={styles.cohortMarkText}>70</Text><Text style={styles.cohortMarkCaption}>STUDIES</Text></View>
            <View style={styles.cohortText}>
              <Text style={styles.cohortTitle}>STA-Apnea sample set</Text>
              <Text style={styles.cohortDescription}>PhysioNet-compatible records, displayed here as interface content only.</Text>
            </View>
          </View>
          <View style={styles.cohortFooter}>
            <Text style={styles.cohortFooterText}>Standard divisions</Text>
            <Text style={styles.cohortGridText}>0.2 s  /  0.5 mV</Text>
          </View>
        </Surface>

        <Surface style={styles.recordsCard}>
          <SectionTitle
            title="Recent workstation records"
            subtitle="Your uploaded studies"
            right={<Link href="/detail" style={styles.viewAll}>View sample</Link>}
          />
          {loading ? (
            <View style={styles.recordsLoading}>
              <ActivityIndicator color={colors.mint} />
            </View>
          ) : error ? (
            <Text style={styles.recordsError}>{error}</Text>
          ) : records.length === 0 ? (
            <View style={styles.recordsEmpty}>
              <Text style={styles.recordsEmptyText}>No studies uploaded yet — start one from the button above.</Text>
            </View>
          ) : (
            <View style={styles.recordList}>
              {records.map((record) => (
                <Link key={record.id} href="/detail" asChild>
                  <Pressable accessibilityRole="link" style={styles.recordRow}>
                    <View style={styles.recordCode}><Text style={styles.recordCodeText}>{record.subjectCode}</Text></View>
                    <View style={styles.recordMain}>
                      <View style={[styles.recordHeading, !desktop && styles.recordHeadingCompact]}>
                        <Text style={styles.recordId}>{record.recordCode}</Text>
                      </View>
                      <Text style={styles.recordMeta}>{record.status}</Text>
                    </View>
                    <View style={styles.recordEnd}>
                      <Pill label="Awaiting analysis" tone="neutral" />
                      <Text style={styles.recordAgo}>{timeAgo(record.createdAt)}</Text>
                    </View>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}
        </Surface>
      </View>

      <View style={styles.footerCallout}>
        <Text style={styles.footerCalloutIcon}>ⓘ</Text>
        <Text style={styles.footerCalloutText}>Records above are real uploads from your account. Risk analysis isn't wired up yet — every study shows "Awaiting analysis" until the ML pipeline is connected.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40, gap: 17 },
  welcomeCard: { minHeight: 146, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 20, backgroundColor: '#17243B', paddingHorizontal: 24, paddingVertical: 23 },
  welcomeCopy: { flex: 1, gap: 7 },
  welcomeEyebrow: { color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  welcomeTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 25, fontWeight: '700' },
  recordsLoading: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  recordsError: { color: colors.rose, fontSize: 11, paddingVertical: 12 },
  recordsEmpty: { minHeight: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  recordsEmptyText: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  welcomeText: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  welcomeAction: { minWidth: 178 },
  primaryButtonText: { color: '#06271F', fontSize: 12, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metricRowCompact: { flexWrap: 'wrap' },
  lowerGrid: { gap: 14 },
  lowerGridWide: { flexDirection: 'row', alignItems: 'stretch' },
  cohortCard: { flex: 1, minWidth: 280 },
  recordsCard: { flex: 1.25, minWidth: 320 },
  cohortInfo: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 7 },
  cohortMark: { width: 78, height: 78, borderRadius: 18, backgroundColor: colors.panelDeep, borderColor: colors.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  cohortMarkText: { color: colors.mint, fontSize: 27, lineHeight: 32, fontWeight: '800' },
  cohortMarkCaption: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  cohortText: { flex: 1, gap: 7 },
  cohortTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 16, fontWeight: '700' },
  cohortDescription: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  cohortFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 9 },
  cohortFooterText: { color: colors.muted, fontSize: 10 },
  cohortGridText: { color: colors.mint, fontSize: 10, fontWeight: '700' },
  viewAll: { color: colors.mint, fontSize: 11, fontWeight: '700' },
  recordList: { gap: 7 },
  recordRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 11, textDecorationLine: 'none', backgroundColor: colors.backgroundSoft, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9 },
  recordCode: { width: 37, height: 37, borderRadius: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.panelRaised },
  recordCodeText: { color: colors.mint, fontSize: 11, fontWeight: '800' },
  recordMain: { flex: 1, minWidth: 80, gap: 4 },
  recordHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordHeadingCompact: { flexWrap: 'wrap' },
  recordId: { color: colors.text, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recordDuration: { color: colors.muted, fontSize: 10 },
  recordMeta: { color: colors.rose, fontSize: 9, fontWeight: '700' },
  recordEnd: { alignItems: 'flex-end', gap: 4 },
  recordAgo: { color: colors.muted, fontSize: 9 },
  footerCallout: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
  footerCalloutIcon: { color: colors.cyan, fontSize: 16 },
  footerCalloutText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
});
