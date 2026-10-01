import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, MetricCard, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';

const records = [
  { code: 'x07', id: 'REC-8842-PT', time: '8.5 h', burden: '47.2%', label: 'Severe OSA', ago: '10 min ago', tone: 'rose' as const },
  { code: 'a13', id: 'REC-8841-KL', time: '8.2 h', burden: '49.3%', label: 'Severe OSA', ago: '42 min ago', tone: 'rose' as const },
  { code: 'a11', id: 'REC-8839-MN', time: '7.8 h', burden: '47.6%', label: 'Severe OSA', ago: '1 h 15 min', tone: 'rose' as const },
  { code: 'b02', id: 'REC-8829-RX', time: '7.3 h', burden: '16.6%', label: 'Mild / Normal', ago: '5 h 20 min', tone: 'mint' as const },
];

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1020;
  const desktop = width >= 760;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="DIRECT CLINICAL MODE"
        title="Welcome to your sleep lab"
        description="A focused workspace for sleep study intake, signal review, and report handoff."
        badge="Demo environment"
      />

      <Surface style={styles.welcomeCard}>
        <View style={[styles.welcomeContent, !desktop && styles.welcomeContentCompact]}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeEyebrow}>SLEEP MEDICINE WORKSPACE</Text>
            <Text style={styles.welcomeTitle}>Good morning, Dr. Thorne</Text>
            <Text style={styles.welcomeText}>Review a sample study or start a new physiological upload.</Text>
            <AppButton href="/upload" style={styles.welcomeAction}>
              <Text style={styles.primaryButtonText}>＋  Start a new study</Text>
            </AppButton>
          </View>
          <Image
            source={require('../../assets/illustrations/sleeping-patient.png')}
            contentFit="contain"
            accessibilityLabel="Illustration of a patient sleeping comfortably"
            style={[styles.welcomeImage, !desktop && styles.welcomeImageCompact]}
          />
        </View>
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
            subtitle="Illustrative sample entries"
            right={<Link href="/detail" style={styles.viewAll}>View sample</Link>}
          />
          <View style={styles.recordList}>
            {records.map((record) => (
              <Link key={record.id} href="/detail" asChild>
                <Pressable accessibilityRole="link" style={styles.recordRow}>
                  <View style={styles.recordCode}><Text style={styles.recordCodeText}>{record.code}</Text></View>
                  <View style={styles.recordMain}>
                    <View style={[styles.recordHeading, !desktop && styles.recordHeadingCompact]}>
                      <Text style={styles.recordId}>{record.id}</Text>
                      {desktop ? <Text style={styles.recordDuration}>{record.time}</Text> : null}
                    </View>
                    <Text style={styles.recordMeta}>{record.burden} apnea interval</Text>
                  </View>
                  <View style={styles.recordEnd}>
                    <Pill label={record.label} tone={record.tone} />
                    <Text style={styles.recordAgo}>{record.ago}</Text>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        </Surface>
      </View>

      <View style={styles.footerCallout}>
        <Text style={styles.footerCalloutIcon}>ⓘ</Text>
        <Text style={styles.footerCalloutText}>All study values on this screen are placeholders for the front-end prototype.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 16 },
  welcomeCard: { backgroundColor: colors.cyanSoft, padding: 22 },
  welcomeContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
  welcomeContentCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  welcomeCopy: { flex: 1, gap: 7 },
  welcomeEyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  welcomeTitle: { color: colors.text, fontSize: 25, lineHeight: 32, fontWeight: '800' },
  welcomeText: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  welcomeAction: { minWidth: 178, alignSelf: 'flex-start', marginTop: 5, backgroundColor: colors.cyan, borderColor: colors.cyan },
  welcomeImage: { width: 182, height: 142 },
  welcomeImageCompact: { width: 210, height: 145, alignSelf: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metricRowCompact: { flexWrap: 'wrap' },
  lowerGrid: { gap: 14 },
  lowerGridWide: { flexDirection: 'row', alignItems: 'stretch' },
  cohortCard: { flex: 1, minWidth: 0 },
  recordsCard: { flex: 1.25, minWidth: 0 },
  cohortInfo: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 7 },
  cohortMark: { width: 78, height: 78, borderRadius: 18, backgroundColor: colors.cyanSoft, borderColor: colors.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  cohortMarkText: { color: colors.mint, fontSize: 27, lineHeight: 32, fontWeight: '800' },
  cohortMarkCaption: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  cohortText: { flex: 1, gap: 7 },
  cohortTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
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
