import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';

const intervals = [
  { start: '00:42:00', end: '00:47:00', duration: '5m' },
  { start: '00:49:00', end: '01:29:00', duration: '40m' },
  { start: '01:40:00', end: '01:56:00', duration: '16m' },
  { start: '03:03:00', end: '03:25:00', duration: '22m' },
  { start: '03:53:00', end: '04:01:00', duration: '8m' },
];
const macroSegments = [9, 8, 5, 10, 11, 7, 6, 10, 5, 8, 7, 9, 6, 8, 10, 6, 11, 5, 8, 7, 10, 6, 9, 8];

export default function DetailScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1020;
  const [activeEvent, setActiveEvent] = useState(2);
  const [streaming, setStreaming] = useState(true);
  const [speed, setSpeed] = useState('1.0×');
  const [zoom, setZoom] = useState(1);
  const [filterActive, setFilterActive] = useState(true);

  const stepEvent = (delta: number) => setActiveEvent((value) => (value + delta + intervals.length) % intervals.length);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="STUDY REVIEW · DEMO VALUES"
        title="Signal detail"
        description="Review controls and event navigation for a sample study. The signal canvas contains no ECG data."
        badge="Example study"
      />

      <Surface style={styles.summaryStrip}>
        <View style={styles.summaryIdentity}>
          <View style={styles.studyAvatar}><Text style={styles.studyAvatarText}>x07</Text></View>
          <View>
            <Text style={styles.studyId}>REC-8842-PT</Text>
            <Text style={styles.studyMeta}>8.5 h record · sample case</Text>
          </View>
          <Pill label="APNEA · A" tone="rose" />
        </View>
        <View style={styles.summaryNumbers}>
          <View style={styles.summaryNumberBlock}>
            <Text style={styles.numberLabel}>TIME / TOTAL</Text>
            <Text style={styles.timeValue}>01:41:53 <Text style={styles.timeTotal}>/ 08:28:20</Text></Text>
          </View>
          <View style={styles.summaryNumberBlock}>
            <Text style={styles.numberLabel}>HEART RATE</Text>
            <Text style={styles.heartValue}>60 <Text style={styles.heartUnit}>BPM</Text></Text>
          </View>
        </View>
      </Surface>

      <View style={[styles.reviewGrid, wide && styles.reviewGridWide]}>
        <View style={styles.mainColumn}>
          <Surface style={styles.viewerPanel}>
            <View style={styles.viewerHeading}>
              <View style={styles.viewerLegend}><View style={styles.mintDot} /><Text style={styles.viewerTitle}>Filtered ECG · 0.5–40 Hz</Text></View>
              <View style={styles.viewerTags}><Pill label="NO SIGNAL DATA" tone="neutral" /><Text style={styles.leadText}>Lead MLII</Text></View>
            </View>
            <View style={styles.waveformCanvas}>
              <View style={styles.gridLineHorizontal1} /><View style={styles.gridLineHorizontal2} />
              <View style={[styles.apneaWindow, { left: `${Math.max(10, 20 + activeEvent * 11)}%` }]} />
              <View style={[styles.cursorLine, { left: `${Math.max(14, 27 + activeEvent * 11)}%` }]} />
              <View style={styles.axisLabels}>
                <Text style={styles.axisText}>+3.5 mV</Text><Text style={styles.axisText}>+2.0</Text><Text style={styles.axisText}>0.0</Text><Text style={styles.axisText}>−1.5</Text><Text style={styles.axisText}>−3.0 mV</Text>
              </View>
              <View style={styles.canvasMessage}>
                <Text style={styles.canvasGlyph}>∿</Text>
                <Text style={styles.canvasTitle}>Waveform preview</Text>
                <Text style={styles.canvasCopy}>ECG data will render here after backend integration.</Text>
              </View>
              <View style={styles.cursorTag}><View style={styles.cursorDot} /><Text style={styles.cursorTagText}>01:41:54 · R-peak marker</Text></View>
            </View>
            <View style={styles.timeRuler}>
              {['1:41:50', '1:41:52', '1:41:54', '1:41:56', '1:41:58'].map((time) => <Text key={time} style={styles.timeTick}>{time}</Text>)}
            </View>
          </Surface>

          <Surface style={styles.controlPanel}>
            <View style={styles.controlRow}>
              <Pressable accessibilityRole="button" onPress={() => setStreaming((value) => !value)} style={[styles.streamButton, streaming && styles.streamButtonActive]}>
                <Text style={[styles.streamButtonText, streaming && styles.streamButtonTextActive]}>{streaming ? 'Ⅱ  Pause stream' : '▶  Start stream'}</Text>
              </Pressable>
              <View style={styles.speedButtons}>
                {['0.5×', '1.0×', '2.0×'].map((item) => <SmallControl key={item} label={item} active={speed === item} onPress={() => setSpeed(item)} />)}
              </View>
              <SmallControl label="◷  10s" active={false} onPress={() => setSpeed('1.0×')} />
            </View>
            <View style={styles.controlRowSecondary}>
              <AppButton onPress={() => setZoom((value) => Math.min(value + 1, 4))} variant="secondary" compact style={styles.flexButton}>
                <Text style={styles.controlText}>⌕  Zoom in ×2</Text>
              </AppButton>
              <AppButton onPress={() => setZoom((value) => Math.max(value - 1, 1))} variant="secondary" compact style={styles.flexButton}>
                <Text style={styles.controlText}>⌕  Zoom out ×2</Text>
              </AppButton>
              <AppButton onPress={() => setFilterActive((value) => !value)} variant="secondary" compact>
                <Text style={styles.controlText}>{filterActive ? '✓  Filter on' : '☷  Filter off'}</Text>
              </AppButton>
              <Text style={styles.zoomLabel}>×{zoom}</Text>
            </View>
          </Surface>

          <Surface style={styles.macroPanel}>
            <SectionTitle title="Full night macro strip" subtitle="Illustrative event markers · tap a segment to seek" right={<Pill label="SAMPLE TIMELINE" tone="neutral" />} />
            <View style={styles.macroStrip}>
              {macroSegments.map((segment, index) => (
                <Pressable key={`${segment}-${index}`} accessibilityRole="button" accessibilityLabel={`Go to sample time segment ${index + 1}`} onPress={() => setActiveEvent(index % intervals.length)} style={[styles.macroSegment, index % 4 === 1 ? styles.macroNormal : styles.macroApnea, index === activeEvent * 3 + 2 && styles.macroSelected, { flexGrow: segment }]} />
              ))}
              <View style={[styles.macroPlayhead, { left: `${26 + activeEvent * 9}%` }]} />
            </View>
            <View style={styles.macroTimes}><Text style={styles.macroTime}>00:00:00</Text><Text style={styles.macroTime}>02:46:40</Text><Text style={styles.macroTime}>05:33:20</Text><Text style={styles.macroTime}>08:28:20</Text></View>
            <View style={styles.eventNav}>
              <AppButton onPress={() => stepEvent(-1)} variant="secondary" compact style={styles.flexButton}><Text style={styles.controlText}>‹  Previous event</Text></AppButton>
              <AppButton onPress={() => stepEvent(1)} variant="secondary" compact style={styles.flexButton}><Text style={styles.controlText}>Next event  ›</Text></AppButton>
            </View>
          </Surface>
        </View>

        <View style={styles.sideColumn}>
          <Surface style={styles.intervalPanel}>
            <SectionTitle title="Apnea intervals" subtitle="Illustrative annotations · 17 total" right={<Pill label="CONSECUTIVE MINUTES" tone="neutral" />} />
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableIndex]}>#</Text><Text style={[styles.tableCell, styles.tableFlex]}>START</Text><Text style={[styles.tableCell, styles.tableFlex]}>END</Text><Text style={[styles.tableCell, styles.tableDuration]}>DUR.</Text>
            </View>
            {intervals.map((item, index) => {
              const active = index === activeEvent;
              return (
                <Pressable key={item.start} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setActiveEvent(index)} style={[styles.tableRow, active && styles.tableRowActive]}>
                  <Text style={[styles.tableValue, styles.tableIndex, active && styles.activeTableValue]}>{index + 1}</Text>
                  <Text style={[styles.tableValue, styles.tableFlex, active && styles.activeTableValue]}>{item.start}</Text>
                  <Text style={[styles.tableValue, styles.tableFlex, active && styles.activeTableValue]}>{item.end}</Text>
                  <Text style={[styles.tableValue, styles.tableDuration, styles.durationValue]}>{item.duration}</Text>
                </Pressable>
              );
            })}
            <View style={styles.intervalFooter}>
              <Text style={styles.intervalNote}>Showing the sample events around this window.</Text>
              <Text style={styles.activeEventNote}>Selected event {activeEvent + 1}</Text>
            </View>
          </Surface>

          <Surface style={styles.detailNote}>
            <Text style={styles.detailNoteTitle}>Waveform connection point</Text>
            <Text style={styles.detailNoteText}>Replace the empty canvas with signal samples from your API when the backend is ready.</Text>
            <AppButton href="/summary" variant="secondary" compact style={styles.summaryLink}>
              <Text style={styles.controlText}>View summary screen  →</Text>
            </AppButton>
          </Surface>
        </View>
      </View>
    </ScrollView>
  );
}

function SmallControl({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.smallControl, active && styles.smallControlActive]}><Text style={[styles.controlText, active && styles.smallControlTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 26, paddingBottom: 42, gap: 15 },
  summaryStrip: { gap: 13, paddingVertical: 15 },
  summaryIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  studyAvatar: { width: 37, height: 37, borderRadius: 9, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  studyAvatarText: { color: colors.mint, fontSize: 13, fontWeight: '800' },
  studyId: { color: colors.text, fontSize: 12, fontWeight: '800' },
  studyMeta: { color: colors.textSoft, fontSize: 10, marginTop: 2 },
  summaryNumbers: { flexDirection: 'row', justifyContent: 'space-between', gap: 17 },
  summaryNumberBlock: { flex: 1, gap: 4 },
  numberLabel: { color: colors.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  timeValue: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeTotal: { color: colors.textSoft, fontSize: 11, fontWeight: '500' },
  heartValue: { color: colors.mint, fontSize: 24, lineHeight: 29, fontWeight: '800' },
  heartUnit: { color: colors.textSoft, fontSize: 10 },
  reviewGrid: { gap: 14 },
  reviewGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainColumn: { flex: 1.45, gap: 13, minWidth: 0 },
  sideColumn: { flex: 1, minWidth: 280, gap: 13 },
  viewerPanel: { padding: 15 },
  viewerHeading: { minHeight: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  viewerLegend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mintDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: colors.mint },
  viewerTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  viewerTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadText: { color: colors.textSoft, fontSize: 10 },
  waveformCanvas: { height: 325, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(117, 204, 244, 0.12)', backgroundColor: '#080D1E' },
  gridLineHorizontal1: { position: 'absolute', top: '35%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(117, 204, 244, 0.08)' },
  gridLineHorizontal2: { position: 'absolute', top: '68%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(117, 204, 244, 0.08)' },
  apneaWindow: { position: 'absolute', top: 0, bottom: 0, width: '20%', backgroundColor: 'rgba(168, 23, 73, 0.15)', borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255, 100, 136, 0.25)' },
  cursorLine: { position: 'absolute', top: 0, bottom: 0, width: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: colors.cyan },
  axisLabels: { position: 'absolute', left: 10, top: 12, bottom: 12, justifyContent: 'space-between' },
  axisText: { color: colors.muted, fontSize: 9 },
  canvasMessage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 70 },
  canvasGlyph: { color: colors.muted, fontSize: 32, opacity: 0.45 },
  canvasTitle: { color: colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 8 },
  canvasCopy: { color: colors.muted, fontSize: 10, textAlign: 'center', lineHeight: 15, marginTop: 5 },
  cursorTag: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: colors.panelRaised },
  cursorDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.cyan },
  cursorTagText: { color: colors.text, fontSize: 9, fontWeight: '700' },
  timeRuler: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, paddingHorizontal: 5, paddingTop: 8 },
  timeTick: { color: colors.textSoft, fontSize: 8, fontVariant: ['tabular-nums'] },
  controlPanel: { gap: 9, padding: 12 },
  controlRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  streamButton: { flexGrow: 1, minWidth: 145, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  streamButtonActive: { backgroundColor: colors.mint, borderColor: colors.mint },
  streamButtonText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  streamButtonTextActive: { color: '#06271F' },
  speedButtons: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 9, backgroundColor: colors.backgroundSoft },
  smallControl: { minHeight: 33, paddingHorizontal: 10, borderRadius: 7, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  smallControlActive: { borderColor: colors.border, backgroundColor: 'rgba(103, 245, 195, 0.11)' },
  smallControlTextActive: { color: colors.mint },
  controlRowSecondary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  flexButton: { flex: 1, minWidth: 105 },
  controlText: { color: colors.textSoft, fontSize: 9, fontWeight: '700' },
  zoomLabel: { color: colors.muted, fontSize: 9, paddingHorizontal: 4 },
  macroPanel: { gap: 4 },
  macroStrip: { height: 54, position: 'relative', overflow: 'hidden', flexDirection: 'row', gap: 2, padding: 7, borderRadius: 9, backgroundColor: colors.panelDeep },
  macroSegment: { borderRadius: 3 },
  macroNormal: { backgroundColor: colors.mintDeep },
  macroApnea: { backgroundColor: colors.roseDeep },
  macroSelected: { opacity: 1, borderWidth: 2, borderColor: colors.cyan },
  macroPlayhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.cyan },
  macroTimes: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 7 },
  macroTime: { color: colors.textSoft, fontSize: 9, fontVariant: ['tabular-nums'] },
  eventNav: { flexDirection: 'row', gap: 7, marginTop: 10 },
  intervalPanel: { padding: 14 },
  tableHeader: { minHeight: 31, flexDirection: 'row', alignItems: 'center', borderRadius: 7, paddingHorizontal: 8, backgroundColor: colors.panelRaised },
  tableCell: { color: colors.textSoft, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  tableIndex: { width: 24 },
  tableFlex: { flex: 1, minWidth: 70 },
  tableDuration: { width: 40, textAlign: 'right' },
  tableRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRowActive: { backgroundColor: 'rgba(168, 23, 73, 0.22)', borderLeftWidth: 3, borderLeftColor: colors.rose },
  tableValue: { color: colors.textSoft, fontSize: 10, fontVariant: ['tabular-nums'] },
  activeTableValue: { color: colors.rose, fontWeight: '800' },
  durationValue: { color: colors.rose, fontWeight: '700' },
  intervalFooter: { gap: 6, marginTop: 12 },
  intervalNote: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  activeEventNote: { color: colors.mint, fontSize: 9, fontWeight: '700' },
  detailNote: { gap: 8, backgroundColor: 'rgba(117, 204, 244, 0.06)' },
  detailNoteTitle: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  detailNoteText: { color: colors.textSoft, fontSize: 10, lineHeight: 15 },
  summaryLink: { alignSelf: 'flex-start', marginTop: 3 },
});
