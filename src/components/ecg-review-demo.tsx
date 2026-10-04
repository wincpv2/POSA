import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { mockNight, type ApneaRun } from './ecg-mock';
import { AppButton, GlassPanel, PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';

// DEMO ONLY: the review tools a clinician would use on the model's output,
// running on synthetic data (ecg-mock.ts) until the model is connected. The
// output shape follows the team's sample study: a per-minute A/N label merged
// into apnea runs, plus R-peaks, beat labels and HR/HRV metrics.

type Review = 'pending' | 'confirmed' | 'rejected';

const MIN_SPAN = 4;
const MAX_SPAN = 1800;
const PRESETS = [30, 120, 600, 1800];
const GAINS = [5, 10, 20]; // mm/mV, 10 is the ECG standard
const SPEEDS = [1, 4, 16, 60];
const red = '#D1495B';
const W = 1000;
// stacked tracks inside the SVG (y ranges)
const T = { ecg: [24, 262], rr: [284, 380], edr: [402, 478], model: [500, 560], label: [566, 582], axis: 604 } as const;
const LEFT = 64;
const RIGHT = 990;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const timeLabel = (n: number) => { const s = Math.max(0, Math.floor(n)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const spanLabel = (s: number) => s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${(s / 60).toFixed(s < 600 ? 1 : 0)} min`;

export default function EcgReviewDemo({ onExit }: { onExit: () => void }) {
  const night = useMemo(() => mockNight(), []);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [current, setCurrent] = useState(night.runs[0].start + 60);
  const [span, setSpan] = useState(120);
  const [gain, setGain] = useState(10);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [reviews, setReviews] = useState<Record<number, Review>>({});
  const [chartWidth, setChartWidth] = useState(1);
  const [timelineWidth, setTimelineWidth] = useState(1);
  const chartRef = useRef<View>(null);

  const start = clamp(current - span / 2, 0, night.duration - span);
  const end = start + span;
  const xOf = (t: number) => LEFT + (t - start) / span * (RIGHT - LEFT);
  const reviewOf = (r: ApneaRun): Review => reviews[r.id] ?? 'pending';
  const counted = night.runs.filter((r) => reviewOf(r) !== 'rejected');
  const apneaMinutes = counted.reduce((n, r) => n + r.minutes, 0);
  const burden = apneaMinutes / night.metrics.labelledMinutes * 100;
  const selected = night.runs.find((r) => current >= r.start && current < r.end);
  const minute = Math.floor(current / 60);
  const m = night.metrics;

  const zoomBy = (factor: number) => setSpan((s) => clamp(s * factor, MIN_SPAN, MAX_SPAN));
  const jump = (direction: -1 | 1) => {
    const target = direction > 0 ? night.runs.find((r) => r.start > current + 1) : [...night.runs].reverse().find((r) => r.end < current - 1);
    if (target) setCurrent(target.start + Math.min(60, (target.end - target.start) / 2));
  };
  const review = (id: number, value: Review) => setReviews((r) => ({ ...r, [id]: r[id] === value ? 'pending' : value }));

  // Playback
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCurrent((c) => { const next = c + 0.25 * speed; if (next >= night.duration) { setPlaying(false); return night.duration; } return next; }), 250);
    return () => clearInterval(timer);
  }, [playing, speed, night.duration]);

  // Mouse wheel zoom (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = chartRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => { event.preventDefault(); zoomBy(event.deltaY > 0 ? 1.15 : 1 / 1.15); };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts (web): ←/→ previous/next run, space play, +/- zoom
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowRight') { event.preventDefault(); jump(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); jump(-1); }
      else if (event.key === ' ') { event.preventDefault(); setPlaying((p) => !p); }
      else if (event.key === '+' || event.key === '=') zoomBy(1 / 1.5);
      else if (event.key === '-') zoomBy(1.5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Drag to pan, pinch to zoom, tap to place the cursor
  const pan = Gesture.Pan().runOnJS(true).minDistance(4)
    .onChange((e) => { setCurrent((c) => clamp(c - e.changeX / chartWidth * span, 0, night.duration)); });
  const pinch = Gesture.Pinch().runOnJS(true)
    .onChange((e) => { setSpan((s) => clamp(s / e.scaleChange, MIN_SPAN, MAX_SPAN)); });
  const tap = Gesture.Tap().runOnJS(true)
    .onEnd((e) => { const x = e.x / chartWidth * W; setCurrent(clamp(start + (x - LEFT) / (RIGHT - LEFT) * span, 0, night.duration)); });
  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));

  // Traces for the visible window
  const traces = useMemo(() => {
    const n = 1400;
    const path = (fn: (t: number) => number, top: number, bottom: number, lo: number, hi: number) => Array.from({ length: n }, (_, i) => {
      const t = start + i / (n - 1) * span;
      const y = bottom - (clamp(fn(t), lo, hi) - lo) / (hi - lo) * (bottom - top);
      return `${i ? 'L' : 'M'}${(LEFT + i / (n - 1) * (RIGHT - LEFT)).toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const mvRange = 20 / gain; // more gain = taller waves = smaller mV range on screen
    const ecgLo = -mvRange * 0.3, ecgHi = mvRange * 0.7;
    const peaks = span <= 60 ? night.beatsBetween(start, end).map((t) => ({ t, y: T.ecg[1] - (clamp(night.ecgAt(t), ecgLo, ecgHi) - ecgLo) / (ecgHi - ecgLo) * (T.ecg[1] - T.ecg[0]) })) : [];
    const minutes: { m: number; x1: number; x2: number }[] = [];
    for (let mm = Math.floor(start / 60); mm * 60 < end; mm++) minutes.push({ m: mm, x1: LEFT + (Math.max(mm * 60, start) - start) / span * (RIGHT - LEFT), x2: LEFT + (Math.min((mm + 1) * 60, end) - start) / span * (RIGHT - LEFT) });
    return {
      ecg: path(night.ecgAt, T.ecg[0], T.ecg[1], ecgLo, ecgHi),
      rr: path(night.rrAt, T.rr[0], T.rr[1], 650, 1300),
      edr: path(night.edrAt, T.edr[0], T.edr[1], -1.4, 1.4),
      peaks, minutes,
    };
  }, [start, end, span, gain, night]);

  // ECG paper grid: finer when zoomed in
  const gridStep = span <= 4 ? 0.2 : span <= 12 ? 1 : span <= 40 ? 5 : span <= 150 ? 10 : span <= 700 ? 60 : 300;
  const gridLines = [];
  for (let t = Math.ceil(start / gridStep) * gridStep; t <= end; t += gridStep) gridLines.push(t);
  const ticks = Array.from({ length: 6 }, (_, i) => start + i * span / 5);
  const modelH = T.model[1] - T.model[0];

  return <View style={styles.wrap}>
    <View style={styles.banner}><Text style={styles.bannerText}>DEMO · Synthetic night in the model&apos;s output format (per-minute A/N labels). This is not this patient&apos;s recording.</Text><Pressable accessibilityRole="button" onPress={onExit} style={styles.bannerExit}><Text style={styles.bannerExitText}>Close demo</Text></Pressable></View>

    <View style={styles.stats}>
      <Stat label="Apnea burden" value={`${burden.toFixed(1)}%`} sub="of labelled minutes" />
      <Stat label="Apnea minutes" value={`${apneaMinutes} / ${m.labelledMinutes}`} sub={`${counted.length} of ${night.runs.length} runs counted`} />
      <Stat label="Cursor" value={timeLabel(current)} sub={`Minute ${minute + 1}: ${night.minuteLabel(minute) === 'A' ? 'A · apnea' : 'N · normal'}${selected ? ` · run #${selected.id}` : ''}`} />
    </View>
    <View style={styles.metrics}>
      <Metric label="R-peaks" value={m.rPeakCount.toLocaleString()} />
      <Metric label="Median HR" value={`${m.medianHrBpm} bpm`} />
      <Metric label="SDNN" value={`${m.sdnnMs} ms`} />
      <Metric label="RMSSD" value={`${m.rmssdMs} ms`} />
      <Metric label="Valid RR" value={`${m.validRrPercent.toFixed(1)}%`} />
    </View>

    <GlassPanel style={styles.toolbar}>
      <Group title="Window">
        {PRESETS.map((p) => <Chip key={p} label={spanLabel(p)} active={Math.abs(span - p) < 0.5} onPress={() => setSpan(p)} />)}
        <View style={styles.zoom}><Chip label="−" onPress={() => zoomBy(1.5)} square /><Text style={styles.zoomValue}>{spanLabel(span)}</Text><Chip label="+" onPress={() => zoomBy(1 / 1.5)} square /></View>
      </Group>
      <Group title="Gain (sensitivity)">
        {GAINS.map((g) => <Chip key={g} label={`${g} mm/mV`} active={gain === g} onPress={() => setGain(g)} />)}
      </Group>
      <Group title="Playback">
        <Chip label={playing ? '❚❚ Pause' : '▶ Play'} active={playing} onPress={() => setPlaying((p) => !p)} />
        {SPEEDS.map((s) => <Chip key={s} label={`${s}×`} active={speed === s} onPress={() => setSpeed(s)} />)}
      </Group>
      <Group title="Apnea runs">
        <Chip label="◀ Previous" onPress={() => jump(-1)} />
        <Chip label="Next ▶" onPress={() => jump(1)} />
      </Group>
    </GlassPanel>

    <GlassPanel style={styles.chartPanel}>
      <View style={styles.chartHead}><Text style={styles.chartTitle}>ECG · R-R · breathing · model per minute</Text><Text style={styles.hint}>{Platform.OS === 'web' ? 'Scroll to zoom · drag to move · tap to place cursor · ←/→ runs · space play' : 'Pinch to zoom · drag to move · tap to place cursor'}</Text></View>
      <GestureHandlerRootView>
        <GestureDetector gesture={gesture}>
          <View ref={chartRef} collapsable={false} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)} style={[styles.chart, { height: wide ? 540 : 420 }]}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${W} 620`} preserveAspectRatio="none">
              <Rect x="0" y="0" width={W} height="620" fill="#061417" />
              {gridLines.map((t) => <Line key={t} x1={xOf(t)} x2={xOf(t)} y1={T.ecg[0]} y2={T.edr[1]} stroke="#1d3a40" strokeWidth={0.8} />)}
              {night.poorSignal.filter((s) => s.end > start && s.start < end).map((s) => <Rect key={s.start} x={xOf(Math.max(s.start, start))} y={T.ecg[0]} width={Math.max(1, xOf(Math.min(s.end, end)) - xOf(Math.max(s.start, start)))} height={T.edr[1] - T.ecg[0]} fill="#8A96A3" fillOpacity={0.28} />)}
              {night.runs.filter((r) => r.end > start && r.start < end).map((r) => { const rv = reviewOf(r); return <Rect key={r.id} x={xOf(Math.max(r.start, start))} y={T.ecg[0]} width={Math.max(1, xOf(Math.min(r.end, end)) - xOf(Math.max(r.start, start)))} height={T.edr[1] - T.ecg[0]} fill={rv === 'rejected' ? '#8A96A3' : red} fillOpacity={rv === 'rejected' ? 0.1 : 0.16} stroke={rv === 'confirmed' ? '#BDEEE5' : 'none'} strokeWidth={2} />; })}
              {[T.rr, T.edr, T.model].map(([top]) => <Line key={top} x1={LEFT} x2={RIGHT} y1={top - 11} y2={top - 11} stroke="#28434a" strokeWidth={1} />)}
              <Path d={traces.ecg} fill="none" stroke="#32E6A6" strokeWidth={1.8} />
              {traces.peaks.map((p) => <Circle key={p.t} cx={xOf(p.t)} cy={p.y} r={span <= 15 ? 4.5 : 3} fill="transparent" stroke="#54E7E8" strokeWidth={1.6} />)}
              {span <= 15 ? traces.peaks.map((p) => <SvgText key={`n${p.t}`} x={xOf(p.t)} y={T.ecg[0] + 14} fill="#BDEEE5" fontSize="12" textAnchor="middle">N</SvgText>) : null}
              <Path d={traces.rr} fill="none" stroke="#FFD166" strokeWidth={2} />
              <Path d={traces.edr} fill="none" stroke="#71D9F2" strokeWidth={1.8} />
              {traces.minutes.map(({ m: mm, x1, x2 }) => { const p = night.minuteProbability(mm); const a = night.minuteLabel(mm) === 'A'; const w = Math.max(0.5, x2 - x1 - (x2 - x1 > 6 ? 1.5 : 0)); return <Rect key={mm} x={x1} y={T.model[1] - p * modelH} width={w} height={p * modelH} fill={a ? '#FF8FA3' : '#4A6A73'} />; })}
              {traces.minutes.map(({ m: mm, x1, x2 }) => { const a = night.minuteLabel(mm) === 'A'; const w = Math.max(0.5, x2 - x1 - (x2 - x1 > 6 ? 1.5 : 0)); return <Rect key={`l${mm}`} x={x1} y={T.label[0]} width={w} height={T.label[1] - T.label[0]} fill={a ? red : '#1f4e57'} />; })}
              {span <= 600 ? traces.minutes.map(({ m: mm, x1, x2 }) => x2 - x1 > 22 ? <SvgText key={`t${mm}`} x={(x1 + x2) / 2} y={T.label[1] - 3} fill="#FFFFFF" fontSize="11" textAnchor="middle">{night.minuteLabel(mm)}</SvgText> : null) : null}
              <Line x1={LEFT} x2={RIGHT} y1={T.model[1] - 0.5 * modelH} y2={T.model[1] - 0.5 * modelH} stroke="#FF8FA3" strokeDasharray="6 6" strokeWidth={0.8} />
              <Line x1={xOf(current)} x2={xOf(current)} y1={T.ecg[0]} y2={T.label[1]} stroke="#CAF0F8" strokeWidth={1.4} />
              <SvgText x={8} y={T.ecg[0] + 14} fill="#CAF0F8" fontSize="13">ECG</SvgText>
              <SvgText x={8} y={T.ecg[0] + 30} fill="#90E0EF" fontSize="11">{gain} mm/mV</SvgText>
              <SvgText x={8} y={T.rr[0] + 14} fill="#FFD166" fontSize="13">R-R</SvgText>
              <SvgText x={8} y={T.rr[0] + 30} fill="#90E0EF" fontSize="11">ms</SvgText>
              <SvgText x={8} y={T.edr[0] + 14} fill="#71D9F2" fontSize="13">EDR</SvgText>
              <SvgText x={8} y={T.model[0] + 14} fill="#FF8FA3" fontSize="13">Model</SvgText>
              <SvgText x={8} y={T.label[1] - 3} fill="#CAF0F8" fontSize="11">A/N</SvgText>
              {ticks.map((t, i) => <SvgText key={i} x={xOf(t)} y={T.axis + 8} fill="#CAF0F8" fontSize="12" textAnchor={i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}>{timeLabel(t)}</SvgText>)}
            </Svg>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      <View style={styles.legend}>
        <Legend color={red} text="Apnea run (A minutes)" /><Legend color="#BDEEE5" text="Confirmed" hollow /><Legend color="#8A96A3" text="Poor signal / rejected" />
        <Legend color="#54E7E8" text="R-peak (N = normal beat)" hollow /><Legend color="#FFD166" text="R-R (slows, then jumps)" line /><Legend color="#71D9F2" text="Breathing from ECG" line /><Legend color="#FF8FA3" text="Model probability per minute · dashed = 50%" line />
      </View>
    </GlassPanel>

    <GlassPanel style={styles.chartPanel}>
      <View style={styles.chartHead}><Text style={styles.chartTitle}>Full night · 8 h 30 min</Text><Text style={styles.hint}>Tap to jump · box = what you see above</Text></View>
      <View onLayout={(e) => setTimelineWidth(e.nativeEvent.layout.width)} style={styles.timeline}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {night.poorSignal.map((s) => <View key={s.start} style={[styles.nightBar, { backgroundColor: '#8A96A3', opacity: 0.6, left: `${s.start / night.duration * 100}%`, width: `${Math.max(0.2, (s.end - s.start) / night.duration * 100)}%` }]} />)}
          {night.runs.map((r) => <View key={r.id} style={[styles.nightBar, { backgroundColor: reviewOf(r) === 'rejected' ? '#8A96A3' : red, left: `${r.start / night.duration * 100}%`, width: `${Math.max(0.15, (r.end - r.start) / night.duration * 100)}%` }]} />)}
          <View style={[styles.brush, { left: `${start / night.duration * 100}%`, width: `${Math.max(0.4, span / night.duration * 100)}%` }]} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Jump within the full night" onPress={(e) => setCurrent(clamp(e.nativeEvent.locationX / timelineWidth * night.duration, 0, night.duration))} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.nightAxis}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => <Text key={h} style={styles.axisText}>{`${h}h`}</Text>)}</View>
    </GlassPanel>

    <GlassPanel style={styles.chartPanel}>
      <View style={styles.chartHead}><Text style={styles.chartTitle}>Apnea runs ({night.runs.length})</Text><Text style={styles.hint}>Tap a row to view it · ✓ confirm · ✕ reject · burden updates</Text></View>
      <View style={styles.rowHead}><Text style={[styles.cell, styles.cNum]}>#</Text><Text style={[styles.cell, styles.cTime]}>Start – end</Text><Text style={[styles.cell, styles.cDur]}>Minutes</Text><Text style={[styles.cell, styles.cConf]}>Model</Text><Text style={[styles.cell, styles.cAct]}>Review</Text></View>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {night.runs.map((r) => { const rv = reviewOf(r); const active = selected?.id === r.id; return (
          <View key={r.id} style={[styles.row, active && styles.rowActive, rv === 'rejected' && styles.rowRejected]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Apnea run ${r.id} from ${timeLabel(r.start)} to ${timeLabel(r.end)}`} onPress={() => setCurrent(r.start + Math.min(60, (r.end - r.start) / 2))} style={styles.rowMain}>
              <Text style={[styles.cell, styles.cNum]}>{r.id}</Text>
              <Text style={[styles.cell, styles.cTime]}>{timeLabel(r.start)} – {timeLabel(r.end)}</Text>
              <Text style={[styles.cell, styles.cDur]}>{r.minutes}</Text>
              <Text style={[styles.cell, styles.cConf, r.meanProbability < 0.7 && styles.lowConf]}>{Math.round(r.meanProbability * 100)}%</Text>
            </Pressable>
            <View style={[styles.cAct, styles.actions]}>
              <Chip label="✓" square active={rv === 'confirmed'} onPress={() => review(r.id, 'confirmed')} />
              <Chip label="✕" square active={rv === 'rejected'} danger onPress={() => review(r.id, 'rejected')} />
            </View>
          </View>
        ); })}
      </ScrollView>
    </GlassPanel>

    <AppButton variant="quiet" onPress={onExit} style={styles.exit}><Text style={styles.quietText}>Close demo</Text></AppButton>
  </View>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <GlassPanel style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statSub}>{sub}</Text></GlassPanel>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.groupRow}>{children}</View></View>;
}
function Chip({ label, onPress, active = false, square = false, danger = false }: { label: string; onPress: () => void; active?: boolean; square?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, square && styles.chipSquare, active && (danger ? styles.chipDanger : styles.chipActive)]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}
function Legend({ color, text, hollow = false, line = false }: { color: string; text: string; hollow?: boolean; line?: boolean }) {
  return <View style={styles.legendItem}><View style={line ? [styles.legendLine, { backgroundColor: color }] : [styles.legendDot, { borderColor: color, backgroundColor: hollow ? 'transparent' : color }]} /><Text style={styles.legendText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  banner: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#FFD166', backgroundColor: 'rgba(255,209,102,0.12)' },
  bannerText: { flex: 1, minWidth: 200, color: '#FFD166', fontSize: 13, fontWeight: '700' },
  bannerExit: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10 }, bannerExitText: { color: colors.text, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flex: 1, minWidth: 180, gap: 4 }, statLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' }, statValue: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800' }, statSub: { color: colors.muted, fontSize: 13 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flex: 1, minWidth: 110, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border, gap: 2 },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, metricValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 },
  group: { flexGrow: 1, minWidth: 200, gap: 8 }, groupTitle: { color: colors.muted, fontSize: 13, fontWeight: '700' }, groupRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  zoom: { flexDirection: 'row', alignItems: 'center', gap: 6 }, zoomValue: { color: colors.text, fontSize: 13, fontWeight: '800', minWidth: 56, textAlign: 'center' },
  chip: { minHeight: 40, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.scrim },
  chipSquare: { width: 40, paddingHorizontal: 0 }, chipActive: { backgroundColor: colors.accent, borderColor: colors.accent }, chipDanger: { backgroundColor: colors.coral, borderColor: colors.coral },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' }, chipTextActive: { color: colors.accentText },
  chartPanel: { gap: 10 }, chartHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chartTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 13 },
  chart: { width: '100%', overflow: 'hidden', borderRadius: 14, backgroundColor: '#061417', cursor: 'grab' } as never,
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 }, legendLine: { width: 18, height: 3, borderRadius: 2 }, legendText: { color: colors.text, fontSize: 13 },
  timeline: { position: 'relative', height: 56, overflow: 'hidden', borderRadius: 12, backgroundColor: '#07171A' },
  nightBar: { position: 'absolute', top: 0, bottom: 0 },
  brush: { position: 'absolute', top: 2, bottom: 2, borderWidth: 2, borderColor: colors.text, borderRadius: 4, backgroundColor: 'rgba(202,240,248,0.12)' },
  nightAxis: { flexDirection: 'row', justifyContent: 'space-between' }, axisText: { color: colors.muted, fontSize: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  list: { maxHeight: 320 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 10, borderRadius: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  rowActive: { backgroundColor: colors.cyanSoft }, rowRejected: { opacity: 0.5 },
  cell: { color: colors.text, fontSize: 13 }, cNum: { width: 36 }, cTime: { flex: 1, minWidth: 140 }, cDur: { width: 64 }, cConf: { width: 56 }, cAct: { width: 96 },
  lowConf: { color: '#FFD166', fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  exit: { alignSelf: 'flex-end', minHeight: 48, paddingHorizontal: 20 }, quietText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
