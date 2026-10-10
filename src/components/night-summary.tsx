import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppButton, PosaText as Text } from '@/components/posa-ui';
import { colors } from '@/components/posa-theme';
import type { RecordSummary } from '@/lib/inference';
import type { PredictionMinute, PredictionRun } from '@/lib/queries';

const durationLabel = (seconds: number) => `${Math.floor(seconds / 3600)} h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')} m`;

export function NightSummaryPanel({ summary, loading, error, run, minutes, durationFallbackSeconds, onRetry }: {
  summary: RecordSummary | null; loading: boolean; error: string; run: PredictionRun | null;
  minutes: PredictionMinute[]; durationFallbackSeconds: number; onRetry?: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const durationSeconds = summary?.durationSeconds || durationFallbackSeconds || (run?.total_minutes ?? minutes.length) * 60;
  const pending = loading ? 'Calculating…' : 'Unavailable';
  const annotationCount = summary?.apneaIntervals.length ?? 0;
  const burden = summary?.labelledMinutes && summary.apneaLabelMinutes != null ? `${(summary.apneaLabelMinutes * 100 / summary.labelledMinutes).toFixed(1)}%` : 'Unavailable';
  const estimate = summary?.modelMetrics;
  const hrV = summary ? `${estimateValue(summary.sdnnMs, ' ms')} / ${estimateValue(summary.rmssdMs, ' ms')}` : pending;
  const chartMessage = summary ? 'The inference summary did not include this chart.'
    : loading ? `${run?.summary_stage || 'Generating ECG summary'} · ${run?.summary_progress_percent ?? 0}%`
      : error || 'The inference summary is not available yet.';
  return <View style={styles.body}>
    <View style={styles.metrics}>
      <Metric label="Recording" value={durationSeconds > 0 ? durationLabel(durationSeconds) : 'Unavailable'} />
      <Metric label="Analysed minutes" value={String(run?.total_minutes ?? '—')} />
      <Metric label="Model apnea minutes" value={String(run?.apnea_minutes ?? '—')} />
      <Metric label="Model apnea share" value={run?.apnea_percent == null ? '—' : `${run.apnea_percent.toFixed(1)}%`} />
      <Metric label="Probability-weighted minutes (Σpᵢ)" value={estimate?.probabilityWeightedApneaMinutes == null ? pending : estimate.probabilityWeightedApneaMinutes.toFixed(1)} />
      <Metric label="Probability-weighted burden" value={estimate?.probabilityWeightedApneaSharePercent == null ? pending : `${estimate.probabilityWeightedApneaSharePercent.toFixed(1)}%`} />
      <Metric label="Model-predicted runs" value={estimate?.predictedRuns == null ? pending : String(estimate.predictedRuns)} />
      <Metric label="Annotation runs" value={summary ? summary.apneaAnnotationsAvailable ? String(annotationCount) : 'A-labels unavailable' : pending} />
      <Metric label="A-label minutes / share" value={summary ? summary.apneaAnnotationsAvailable ? `${summary.apneaLabelMinutes} / ${burden}` : 'A-labels unavailable' : pending} />
      <Metric label="Median heart rate" value={summary?.medianHrBpm == null ? summary ? 'Unavailable' : pending : `${summary.medianHrBpm.toFixed(0)} bpm`} />
      <Metric label="SDNN / RMSSD estimate" value={hrV} />
      <Metric label="Valid RR intervals" value={summary?.validRrPercent == null ? summary ? 'No valid RR data' : pending : `${summary.validRrPercent.toFixed(1)}%`} />
    </View>
    <Text style={styles.note}>Probability-weighted burden = 100 × Σpᵢ / N, where N is the number of analyzed minute windows. This score is not calibration-adjusted. Positive minutes use pᵢ ≥ 0.50; adjacent positive minutes form a predicted run. These are model outputs, not clinical apnea events or AHI. HRV uses {summary?.qrsAnnotationsAvailable ? 'normal-beat QRS annotations.' : 'automatically detected R-peaks and is an estimate.'}</Text>
    {loading ? <Text style={styles.note}>Calculating full-record ECG summary…</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!summary && onRetry ? <AppButton compact variant="quiet" onPress={onRetry}><Text style={styles.retry}>{loading ? 'Restart summary' : 'Retry summary'}</Text></AppButton> : null}
    <View style={styles.charts}>
      <Chart title="Minute median heart rate · red marks show A-label runs or model predictions" xml={summary?.charts.screen.heartRateSvg} unavailableMessage={chartMessage} aspect={12 / 3.4} wide />
      <View style={[styles.secondaryCharts, wide && styles.secondaryChartsWide]}>
        <Chart title="Hourly model apnea burden" xml={summary?.charts.screen.hourlyApneaSvg} unavailableMessage={chartMessage} aspect={8 / 3.4} half={wide} />
        <Chart title="Plausible RR-interval distribution" xml={summary?.charts.screen.rrHistogramSvg} unavailableMessage={chartMessage} aspect={8 / 3.4} half={wide} />
      </View>
    </View>
  </View>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
const estimateValue = (value: number | null, suffix = '') => value == null ? 'Unavailable' : `${value.toFixed(0)}${suffix}`;
export function Chart({ title, xml, aspect, wide, half, unavailableMessage = 'Python chart is unavailable until the inference summary loads.' }: { title: string; xml?: string; unavailableMessage?: string; aspect: number; wide?: boolean; half?: boolean }) {
  const [width, setWidth] = useState(0);
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.chart, wide && styles.chartWide, half && styles.chartHalf]}>
    <Text style={styles.chartTitle}>{title}</Text>
    {xml && width ? <SvgXml xml={xml} width="100%" height={Math.round(Math.max(0, width - 24) / aspect)} preserveAspectRatio="none" /> : <Text style={styles.note}>{unavailableMessage}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  body: { gap: 12 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '22%', minWidth: 145, padding: 12, gap: 4, backgroundColor: colors.scrim, borderRadius: 12 },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, metricValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 }, error: { color: colors.coral, fontSize: 14 },
  charts: { gap: 10 }, secondaryCharts: { gap: 10 }, secondaryChartsWide: { flexDirection: 'row' }, chartWide: { width: '100%' }, chartHalf: { flex: 1, minWidth: 0 },
  chart: { gap: 5, padding: 12, backgroundColor: '#12283A', borderColor: '#314B5D', borderWidth: 1, borderRadius: 14 }, chartTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  errorBox: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, retry: { color: colors.cyan, fontWeight: '800' },
});
