import { Image, StyleSheet, View } from 'react-native';

import { GlassPanel, PosaText as Text } from './posa-ui';
import { AHI_BANDS, ahiBand, formatResult, hasLeadValue, RESULT_GROUPS, rowsOf, type Audience, type SleepResults } from './sleep-results-data';

import { colors } from './posa-theme';

export { EMPTY_RESULTS, type SleepResults } from './sleep-results-data';

// Sleep-apnea results panel for the clinician Summary and the patient screens.
// Definitions (labels, units, Thai wording) live in sleep-results-data.ts.
export function SleepResultsPanel({ results, audience }: { results: SleepResults; audience: Audience }) {
  const missing = Object.values(results).every((v) => v === null);
  return (
    <GlassPanel style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.heading}>{audience === 'patient' ? 'Your results' : 'Results'}</Text>
        {missing ? <Text style={styles.pending}>รอผลวิเคราะห์</Text> : null}
      </View>
      <View style={styles.groups}>
        {RESULT_GROUPS.map((g) => {
          const leadIsCount = !hasLeadValue(g);
          return (
            <View key={g.title} style={styles.group}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              {!leadIsCount ? <>
                <Text style={styles.leadLabel}>{g.leadLabel}</Text>
                <Text style={styles.leadValue}>{formatResult(results[g.lead], g.leadUnit)}</Text>
              </> : null}
              <Text style={styles.desc}>{audience === 'patient' ? g.patient : g.clinician}</Text>
              <View style={styles.rows}>
                {rowsOf(g).map((r) => (
                  <View key={r.key} style={styles.row}>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowLabel}>{r.label}</Text>
                      <Text style={styles.rowDesc}>{audience === 'patient' ? r.patient : r.clinician}</Text>
                    </View>
                    <Text style={styles.rowValue}>{formatResult(results[r.key], r.unit)}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
      {missing ? <Text style={styles.note}>“—” = ยังไม่มีค่า จะแสดงเมื่อเชื่อมต่อผลวิเคราะห์แล้ว (ODI / SpO₂ ต้องมีเครื่องวัดออกซิเจนร่วมด้วย)</Text> : null}
    </GlassPanel>
  );
}

// The patient's picture summary: illustration + where their AHI sits on the scale.
export function SeveritySummary({ ahi }: { ahi: number | null }) {
  const band = ahiBand(ahi);
  const markerLeft = ahi === null ? null : `${Math.min(99, Math.max(1, ahi < 5 ? ahi / 5 * 25 : ahi < 15 ? 25 + (ahi - 5) / 10 * 25 : ahi < 30 ? 50 + (ahi - 15) / 15 * 25 : 75 + Math.min(1, (ahi - 30) / 30) * 25))}%`;
  return (
    <GlassPanel style={styles.summary}>
      <Image source={require('../../assets/images/splash-icon.png')} style={styles.art} accessibilityIgnoresInvertColors accessible accessibilityLabel="Illustration of a person sleeping" />
      <View style={styles.summaryCopy}>
        <Text style={styles.sectionLabel}>สรุปผลการนอน</Text>
        <Text style={styles.summaryTitle}>{band < 0 ? 'รอผลวิเคราะห์' : `ระดับ${AHI_BANDS[band].label}`}</Text>
        <Text style={styles.desc}>{band < 0 ? 'เมื่อแพทย์ได้ผลวิเคราะห์ จะเห็นว่าค่า AHI ของคุณอยู่ระดับใด' : `AHI ${formatResult(ahi, '/h')} อยู่ในช่วง${AHI_BANDS[band].label}`}</Text>
        <View style={styles.scale}>
          {AHI_BANDS.map((b, i) => <View key={b.label} style={[styles.band, { backgroundColor: b.color, opacity: band < 0 || band === i ? 1 : 0.35 }]} />)}
          {markerLeft ? <View style={[styles.marker, { left: markerLeft as `${number}%` }]} /> : null}
        </View>
        <View style={styles.scaleLabels}>{AHI_BANDS.map((b) => <View key={b.label} style={styles.scaleLabel}><Text style={styles.scaleName}>{b.label}</Text><Text style={styles.scaleRange}>{b.range}</Text></View>)}</View>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  pending: { color: colors.text, fontSize: 12, fontWeight: '800', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  group: { flex: 1, minWidth: 240, gap: 6, padding: 14, borderRadius: 18, backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border },
  groupTitle: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  leadLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  leadValue: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  rows: { gap: 2, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  rowCopy: { flex: 1, gap: 1 },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowDesc: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 56, textAlign: 'right' },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  art: { width: 120, height: 120, borderRadius: 24 },
  summaryCopy: { flex: 1, minWidth: 220, gap: 6 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  summaryTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  scale: { position: 'relative', flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'visible', marginTop: 6, gap: 3 },
  band: { flex: 1, height: 14, borderRadius: 999 },
  marker: { position: 'absolute', top: -5, width: 6, height: 24, marginLeft: -3, borderRadius: 3, backgroundColor: colors.text, borderWidth: 1, borderColor: colors.background },
  scaleLabels: { flexDirection: 'row', gap: 3 },
  scaleLabel: { flex: 1, alignItems: 'center' },
  scaleName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  scaleRange: { color: colors.muted, fontSize: 11 },
});
