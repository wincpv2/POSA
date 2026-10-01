import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';

const timeline = [
  { time: '22:00', kind: 'normal' }, { time: '23:10', kind: 'normal' }, { time: '00:00', kind: 'normal' },
  { time: '00:42', kind: 'apnea' }, { time: '00:49', kind: 'apnea' }, { time: '01:29', kind: 'normal' },
  { time: '01:40', kind: 'apnea' }, { time: '01:56', kind: 'normal' }, { time: '03:03', kind: 'apnea' },
  { time: '03:25', kind: 'normal' }, { time: '03:53', kind: 'apnea' }, { time: '04:01', kind: 'normal' },
  { time: '05:00', kind: 'normal' }, { time: '06:30', kind: 'normal' },
];

export default function SummaryScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1020;
  const [exportMessage, setExportMessage] = useState('');

  const showExportMessage = () => setExportMessage('Export controls are ready to connect to your report service.');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="REPORT VIEW · DEMO DATA"
        title="Study summary"
        description="A front-end report layout for the future analysis response. All values shown here are illustrative placeholders."
        badge="Sample report"
      />

      <Surface style={styles.diagnosisBanner}>
        <View style={styles.bannerTop}>
          <View style={styles.diagnosisPill}><View style={styles.diagnosisDot} /><Text style={styles.diagnosisPillText}>SAMPLE CLASSIFICATION</Text></View>
          <Text style={styles.bannerMeta}>ID: PT-2024-X07  ·  08h 28m study</Text>
        </View>
        <Text style={styles.diagnosisTitle}>Overnight analysis summary</Text>
        <Text style={styles.diagnosisText}>The backend result and clinical interpretation will be displayed in this space after integration.</Text>
      </Surface>

      <Surface style={styles.burdenPanel}>
        <SectionTitle title="Severity & cumulative burden" subtitle="Illustrative report values" right={<Pill label="DEMO DATA" tone="neutral" />} />
        <View style={[styles.burdenContent, wide && styles.burdenContentWide]}>
          <View style={styles.indexRing}>
            <Text style={styles.indexValue}>47.2<Text style={styles.indexPercent}>%</Text></Text>
            <Text style={styles.indexLabel}>SAMPLE INDEX</Text>
          </View>
          <View style={styles.burdenStats}>
            <BurdenStat label="Total apnea" value="240 min" tone="rose" />
            <BurdenStat label="Desaturation episodes" value="17 events" tone="blue" />
            <BurdenStat label="Clear airflow" value="268 min" tone="mint" />
          </View>
        </View>
      </Surface>

      <View style={[styles.resultGrid, wide && styles.resultGridWide]}>
        <View style={styles.primaryColumn}>
          <Surface style={styles.hypnogramPanel}>
            <SectionTitle title="Chronological event strip" subtitle="Placeholder timeline · not connected to study data" right={<View style={styles.legend}><View style={styles.legendItem}><View style={styles.legendNormal} /><Text style={styles.legendLabel}>Normal</Text></View><View style={styles.legendItem}><View style={styles.legendApnea} /><Text style={styles.legendLabel}>Event</Text></View></View>} />
            <View style={styles.hypnogram}>
              {timeline.map((segment, index) => <View key={`${segment.time}-${index}`} style={[styles.timelineSegment, segment.kind === 'apnea' ? styles.timelineApnea : styles.timelineNormal, { flexGrow: index % 3 === 0 ? 1.2 : 1 }]} />)}
            </View>
            <View style={styles.hypnogramTimes}>{['22:00', '00:00', '01:00 · Peak', '03:00', '05:00', '06:30'].map((time) => <Text key={time} style={styles.hypnogramTime}>{time}</Text>)}</View>
          </Surface>

          <Surface style={styles.peakPanel}>
            <View style={styles.peakIcon}><Text style={styles.peakIconText}>⌁</Text></View>
            <View style={styles.peakCopy}>
              <View style={styles.peakHeading}><Text style={styles.peakTitle}>Longest event</Text><Pill label="SAMPLE INTERVAL" tone="rose" /></View>
              <Text style={styles.peakText}>The connected analysis response can highlight the longest event and its time range here.</Text>
            </View>
          </Surface>

          <Surface style={styles.heartPanel}>
            <SectionTitle title="Heart rate overview" subtitle="ECG image and trace data not included" right={<Text style={styles.meanValue}>Mean: <Text style={styles.meanAccent}>60 bpm</Text></Text>} />
            <View style={styles.heartCanvas}>
              <View style={styles.heartGridLine} />
              <Text style={styles.heartPlaceholder}>Heart rate series will appear here</Text>
            </View>
            <View style={styles.heartExtremes}>
              <View><Text style={styles.extremeLabel}>↓  Nadir</Text><Text style={styles.extremeValue}>Backend result pending</Text></View>
              <View><Text style={styles.extremeLabel}>↑  Peak</Text><Text style={styles.extremeValue}>Backend result pending</Text></View>
            </View>
          </Surface>
        </View>

        <View style={styles.sideColumn}>
          <Surface style={styles.interpretationPanel}>
            <SectionTitle title="Physician interpretation" subtitle="Clinical report integration point" right={<Pill label="PENDING" tone="neutral" />} />
            <View style={styles.reportPlaceholder}>
              <Text style={styles.reportPlaceholderMark}>✳</Text>
              <Text style={styles.reportPlaceholderTitle}>Report text will appear here</Text>
              <Text style={styles.reportPlaceholderCopy}>Connect this panel to your backend summary and clinician review workflow.</Text>
            </View>
          </Surface>

          <Surface style={styles.understandingPanel}>
            <SectionTitle title="Understanding your results" subtitle="Space reserved for patient-facing explanations" />
            <Text style={styles.understandingCopy}>Add plain-language guidance from your clinical content team when the analysis service is connected.</Text>
            <View style={styles.nextSteps}>
              <NextStep icon="✓" title="Review" text="Confirm the summary with the clinician workflow." tone="mint" />
              <NextStep icon="＋" title="Follow-up" text="Link approved next steps from your care team." tone="blue" />
            </View>
          </Surface>
        </View>
      </View>

      <Surface style={styles.exportPanel}>
        <View style={styles.exportHead}>
          <View><Text style={styles.exportTitle}>Report actions</Text><Text style={styles.exportSubtitle}>UI preview · document generation not connected</Text></View>
          <Pill label="DEMO" tone="neutral" />
        </View>
        <AppButton onPress={showExportMessage} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>↗  Share report preview</Text>
        </AppButton>
        <View style={styles.exportActions}>
          <AppButton onPress={showExportMessage} variant="secondary" style={styles.exportAction}><Text style={styles.exportActionText}>▣  Export report</Text></AppButton>
          <AppButton onPress={showExportMessage} variant="secondary" style={styles.exportAction}><Text style={styles.exportActionText}>▤  Print preview</Text></AppButton>
        </View>
        {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}
      </Surface>
    </ScrollView>
  );
}

function BurdenStat({ label, value, tone }: { label: string; value: string; tone: 'rose' | 'blue' | 'mint' }) {
  return (
    <View style={styles.burdenStat}>
      <View style={[styles.burdenStatDot, burdenDots[tone]]} />
      <Text style={styles.burdenStatLabel}>{label}</Text>
      <Text style={[styles.burdenStatValue, burdenValues[tone]]}>{value}</Text>
    </View>
  );
}

function NextStep({ icon, title, text, tone }: { icon: string; title: string; text: string; tone: 'mint' | 'blue' }) {
  return (
    <View style={[styles.nextStep, tone === 'blue' && styles.nextStepBlue]}>
      <Text style={[styles.nextStepIcon, tone === 'blue' && styles.nextStepIconBlue]}>{icon}</Text>
      <Text style={[styles.nextStepTitle, tone === 'blue' && styles.nextStepTitleBlue]}>{title}</Text>
      <Text style={styles.nextStepText}>{text}</Text>
    </View>
  );
}

const burdenDots = StyleSheet.create({ rose: { backgroundColor: colors.rose }, blue: { backgroundColor: colors.cyan }, mint: { backgroundColor: colors.mintDeep } });
const burdenValues = StyleSheet.create({ rose: { color: colors.rose }, blue: { color: colors.cyan }, mint: { color: colors.mint } });

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 42, gap: 15 },
  diagnosisBanner: { backgroundColor: colors.roseSoft, gap: 10 },
  bannerTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  diagnosisPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FFE1E1' },
  diagnosisDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose },
  diagnosisPillText: { color: colors.rose, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  bannerMeta: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
  diagnosisTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  diagnosisText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  burdenPanel: { gap: 5 },
  burdenContent: { gap: 15, alignItems: 'center' },
  burdenContentWide: { flexDirection: 'row' },
  indexRing: { width: 154, height: 154, flexShrink: 0, borderRadius: 80, borderWidth: 10, borderColor: colors.panelRaised, borderTopColor: colors.rose, borderRightColor: colors.rose, transform: [{ rotate: '35deg' }], alignItems: 'center', justifyContent: 'center' },
  indexValue: { color: colors.text, fontSize: 30, fontWeight: '800', transform: [{ rotate: '-35deg' }] },
  indexPercent: { color: colors.rose, fontSize: 16 },
  indexLabel: { color: colors.textSoft, fontSize: 8, fontWeight: '800', letterSpacing: 0.5, transform: [{ rotate: '-35deg' }] },
  burdenStats: { flex: 1, width: '100%', gap: 8 },
  burdenStat: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: 8, backgroundColor: colors.panelRaised },
  burdenStatDot: { width: 8, height: 8, borderRadius: 5 },
  burdenStatLabel: { flex: 1, color: colors.textSoft, fontSize: 10 },
  burdenStatValue: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resultGrid: { gap: 14 },
  resultGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { flex: 1.2, minWidth: 0, gap: 13 },
  sideColumn: { flex: 1, minWidth: 0, gap: 13 },
  hypnogramPanel: { padding: 17 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendNormal: { width: 7, height: 7, borderRadius: 5, backgroundColor: colors.mint },
  legendApnea: { width: 7, height: 7, borderRadius: 5, backgroundColor: colors.rose },
  legendLabel: { color: colors.textSoft, fontSize: 9 },
  hypnogram: { height: 42, flexDirection: 'row', gap: 2, padding: 4, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panelDeep },
  timelineSegment: { borderRadius: 2 },
  timelineNormal: { backgroundColor: colors.mintDeep },
  timelineApnea: { backgroundColor: colors.roseDeep },
  hypnogramTimes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 7, paddingTop: 9 },
  hypnogramTime: { color: colors.textSoft, fontSize: 9 },
  peakPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.roseSoft },
  peakIcon: { width: 34, height: 34, borderRadius: 18, backgroundColor: '#FFE1E1', alignItems: 'center', justifyContent: 'center' },
  peakIconText: { color: colors.rose, fontSize: 21 },
  peakCopy: { flex: 1, gap: 7 },
  peakHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 7 },
  peakTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  peakText: { color: colors.textSoft, fontSize: 10, lineHeight: 16 },
  heartPanel: { gap: 10 },
  meanValue: { color: colors.textSoft, fontSize: 9 },
  meanAccent: { color: colors.mint, fontWeight: '800' },
  heartCanvas: { height: 115, position: 'relative', borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border },
  heartGridLine: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: 'rgba(0, 210, 255, 0.2)' },
  heartPlaceholder: { color: '#B6CBD4', fontSize: 10 },
  heartExtremes: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  extremeLabel: { color: colors.textSoft, fontSize: 9, fontWeight: '700' },
  extremeValue: { color: colors.muted, fontSize: 9, marginTop: 4 },
  interpretationPanel: { gap: 9 },
  reportPlaceholder: { minHeight: 180, borderRadius: 10, backgroundColor: colors.backgroundSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 18 },
  reportPlaceholderMark: { color: colors.mint, fontSize: 23 },
  reportPlaceholderTitle: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 9 },
  reportPlaceholderCopy: { maxWidth: 290, color: colors.textSoft, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6 },
  understandingPanel: { gap: 10 },
  understandingCopy: { color: colors.textSoft, fontSize: 10, lineHeight: 16 },
  nextSteps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nextStep: { flex: 1, minWidth: 140, minHeight: 108, borderRadius: 12, padding: 12, backgroundColor: colors.backgroundSoft },
  nextStepBlue: { borderColor: colors.border, borderWidth: 1 },
  nextStepIcon: { color: colors.mint, fontSize: 14, fontWeight: '800' },
  nextStepIconBlue: { color: colors.cyan },
  nextStepTitle: { color: colors.mint, fontSize: 10, fontWeight: '800', marginTop: 4 },
  nextStepTitleBlue: { color: colors.cyan },
  nextStepText: { color: colors.textSoft, fontSize: 9, lineHeight: 14, marginTop: 5 },
  exportPanel: { gap: 10 },
  exportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  exportTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  exportSubtitle: { color: colors.textSoft, fontSize: 10, marginTop: 4 },
  shareButton: { minHeight: 48 },
  shareButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  exportActions: { flexDirection: 'row', gap: 8 },
  exportAction: { flex: 1 },
  exportActionText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  exportMessage: { color: colors.mint, fontSize: 10, textAlign: 'center', lineHeight: 15 },
});
