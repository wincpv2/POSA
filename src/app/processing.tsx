import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';

const telemetry = [
  { time: '[00:01.2s]', text: 'Baseline correction stage', tone: 'mint' as const },
  { time: '[00:04.8s]', text: 'R-peak and interval stage', tone: 'neutral' as const },
  { time: '[00:08.1s]', text: 'Event classification stage', tone: 'neutral' as const },
  { time: '[00:10.4s]', text: 'Temporal alignment stage', tone: 'blue' as const },
];

export default function ProcessingScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1020;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="ANALYSIS WORKFLOW"
        title="Processing preview"
        description="A static view of the planned inference experience. Progress and metrics below are illustrative and are not produced by a model."
        badge="Simulated"
      />

      <Surface style={styles.studyBanner}>
        <View style={styles.bannerMark}><Text style={styles.bannerMarkText}>◉</Text></View>
        <View style={styles.bannerCopy}>
          <View style={styles.bannerBadges}><Pill label="INFERENCE PASS 2 / 2" /><Pill label="DEMO CASE" tone="neutral" /></View>
          <Text style={styles.bannerTitle}>Analyzing nocturnal polysomnography & ECG</Text>
          <Text style={styles.bannerText}>This screen demonstrates the processing state while the backend integration is pending.</Text>
        </View>
      </Surface>

      <View style={[styles.grid, wide && styles.gridWide]}>
        <View style={styles.mainColumn}>
          <Surface style={styles.progressPanel}>
            <SectionTitle title="Inference progress" subtitle="Illustrative front-end state" right={<Text style={styles.progressVersion}>STA-04</Text>} />
            <View style={styles.progressContent}>
              <View style={styles.progressRing}>
                <View style={styles.progressRingInner}>
                  <Text style={styles.progressNumber}>79%</Text>
                  <Text style={styles.progressLabel}>PROCESSED</Text>
                  <Text style={styles.progressBatch}>Batch 04 / 04</Text>
                </View>
              </View>
              <View style={styles.windowCard}>
                <View style={styles.windowHeader}>
                  <Text style={styles.windowLabel}>CURRENT PASS WINDOW</Text>
                  <Text style={styles.windowValue}>384 <Text style={styles.windowUnit}>/ 492 min</Text></Text>
                </View>
                <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
                <View style={styles.channelHeader}>
                  <Text style={styles.channelLabel}>LIVE CHANNEL · LEAD II</Text>
                  <Text style={styles.channelStatus}>●  250 Hz synchronized</Text>
                </View>
                <View style={styles.channelPlaceholder}>
                  <Text style={styles.channelPlaceholderGlyph}>∿  ∿  ∿  ∿  ∿  ∿  ∿  ∿</Text>
                  <Text style={styles.channelPlaceholderText}>Signal preview placeholder</Text>
                </View>
              </View>
            </View>
          </Surface>

          <Surface style={styles.telemetryPanel}>
            <SectionTitle title="Telemetry console" subtitle="Example processing log" right={<Text style={styles.utcLabel}>UTC · SAMPLE</Text>} />
            <View style={styles.logList}>
              {telemetry.map((item) => (
                <View key={item.time} style={styles.logRow}>
                  <Text style={[styles.logTime, item.tone === 'blue' && styles.logBlue, item.tone === 'neutral' && styles.logMuted]}>{item.time}</Text>
                  <Text style={[styles.logText, item.tone === 'blue' && styles.logBlue, item.tone === 'neutral' && styles.logMuted]}>{item.text}</Text>
                </View>
              ))}
            </View>
          </Surface>
        </View>

        <View style={styles.sideColumn}>
          <Surface style={styles.statsPanel}>
            <SectionTitle title="Signal quality & telemetry" subtitle="Values pending live integration" right={<Pill label="NOMINAL" tone="neutral" />} />
            <View style={styles.statGrid}>
              <Stat label="TOTAL DURATION" value="08:28:20" note="Full nocturnal strip" />
              <Stat label="SIGNAL-TO-NOISE" value="24.2 dB" note="Example display value" accent />
              <Stat label="ARTIFACT EXCLUDED" value="0.14%" note="Example display value" />
              <Stat label="QRS COMPLEXES" value="30,540" note="Example display value" accent />
            </View>
            <View style={styles.connectionRow}><Text style={styles.connectionLabel}>Lead disconnect state</Text><Text style={styles.connectionValue}>NOT CONNECTED</Text></View>
          </Surface>

          <View style={styles.actions}>
            <AppButton href="/detail" style={styles.actionButton}>
              <Text style={styles.primaryActionText}>Open detail screen  →</Text>
            </AppButton>
            <Link href="/upload" style={styles.backLink}>←  Return to data ingestion</Link>
          </View>

          <Surface style={styles.modelPanel}>
            <SectionTitle title="Model architecture" subtitle="Backend service slot" right={<Pill label="NOT CONNECTED" tone="amber" />} />
            <Text style={styles.modelLabel}>PLANNED PIPELINE</Text>
            <Text style={styles.modelText}>QRS detection · interval extraction · event classification</Text>
            <View style={styles.modelDivider} />
            <Text style={styles.modelLabel}>MODEL METRICS</Text>
            <Text style={styles.modelPending}>Evaluation scores will be supplied by your backend.</Text>
          </Surface>
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statAccent]}>{value}</Text>
      <Text style={styles.statNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 42, gap: 16 },
  studyBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: colors.cyanSoft },
  bannerMark: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  bannerMarkText: { color: colors.mint, fontSize: 22 },
  bannerCopy: { flex: 1, gap: 7 },
  bannerBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  bannerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bannerText: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
  grid: { gap: 15 },
  gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainColumn: { flex: 1.25, gap: 15, minWidth: 0 },
  sideColumn: { flex: 1, minWidth: 0, gap: 15 },
  progressPanel: { minHeight: 370 },
  progressVersion: { color: colors.mint, fontSize: 10, fontWeight: '800' },
  progressContent: { flex: 1, alignItems: 'center', justifyContent: 'space-around', gap: 19, paddingVertical: 8 },
  progressRing: { width: 178, height: 178, borderRadius: 90, borderWidth: 8, borderColor: colors.mintDeep, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0, 107, 86, 0.12)' },
  progressRingInner: { alignItems: 'center', gap: 2 },
  progressNumber: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressLabel: { color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  progressBatch: { color: colors.textSoft, fontSize: 10, marginTop: 4 },
  windowCard: { width: '100%', borderRadius: 12, backgroundColor: colors.backgroundSoft, borderWidth: 1, borderColor: colors.border, padding: 14 },
  windowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  windowLabel: { color: colors.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  windowValue: { color: colors.mint, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  windowUnit: { color: colors.textSoft, fontSize: 10, fontWeight: '500' },
  progressTrack: { height: 5, borderRadius: 5, backgroundColor: colors.panelRaised, overflow: 'hidden', marginTop: 11 },
  progressFill: { width: '79%', height: '100%', borderRadius: 5, backgroundColor: colors.mint },
  channelHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 15, marginBottom: 8 },
  channelLabel: { color: colors.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  channelStatus: { color: colors.mint, fontSize: 9, fontWeight: '700' },
  channelPlaceholder: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, backgroundColor: colors.panelDeep, borderRadius: 7 },
  channelPlaceholderGlyph: { color: colors.mintDeep, fontSize: 12, letterSpacing: 1 },
  channelPlaceholderText: { color: '#B6CBD4', fontSize: 9 },
  telemetryPanel: { gap: 5 },
  utcLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  logList: { backgroundColor: colors.backgroundSoft, borderRadius: 9, overflow: 'hidden' },
  logRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  logTime: { color: colors.mint, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  logText: { flex: 1, color: colors.textSoft, fontSize: 10 },
  logMuted: { color: colors.muted },
  logBlue: { color: colors.cyan },
  statsPanel: { gap: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48%', flexGrow: 1, minHeight: 84, padding: 10, borderRadius: 9, backgroundColor: colors.backgroundSoft, gap: 5 },
  statLabel: { color: colors.textSoft, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statAccent: { color: colors.mint },
  statNote: { color: colors.muted, fontSize: 9 },
  connectionRow: { minHeight: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10 },
  connectionLabel: { color: colors.textSoft, fontSize: 10 },
  connectionValue: { color: colors.amber, fontSize: 9, fontWeight: '800' },
  modelPanel: { gap: 9 },
  modelLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.9 },
  modelText: { color: colors.text, fontSize: 12, lineHeight: 19 },
  modelDivider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  modelPending: { color: colors.textSoft, fontSize: 10, lineHeight: 16 },
  actions: { alignItems: 'center', gap: 11 },
  actionButton: { width: '100%' },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  backLink: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
});
