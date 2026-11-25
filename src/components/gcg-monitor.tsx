import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { getGcgSnapshot, type GcgChannel, type GcgMode, type GcgSnapshot } from '@/lib/gcg';
import { localDeviceStorage } from '@/lib/supabase';

import { colors, fonts } from './posa-theme';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from './posa-ui';

const BOARD_KEY = 'posa:gcg:board';
const DEFAULT_BOARD = 'http://unoq-sbc.local:7000';
const modes: { value: GcgMode; label: string }[] = [
  { value: 'auto', label: 'Auto + backup' },
  { value: 'live', label: 'Sensor only' },
  { value: 'mock', label: 'Mock demo' },
];

const axes = [
  { label: 'X', color: '#53D5C5' },
  { label: 'Y', color: '#FFC857' },
  { label: 'Z', color: '#C4B5FD' },
];

export default function GcgMonitor() {
  const [boardInput, setBoardInput] = useState(DEFAULT_BOARD);
  const [board, setBoard] = useState(DEFAULT_BOARD);
  const [mode, setMode] = useState<GcgMode>('auto');
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<GcgSnapshot | null>(null);
  const [error, setError] = useState('');
  const [group, setGroup] = useState<'gyro' | 'accel'>('gyro');

  useEffect(() => {
    let active = true;
    void localDeviceStorage.getItem(BOARD_KEY).then((saved) => {
      if (active && saved) { setBoard(saved); setBoardInput(saved); }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (paused) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await getGcgSnapshot(mode, board, controller.signal);
        if (active) { setSnapshot(next); setError(''); }
      } catch (reason) {
        if (active) {
          setSnapshot(null);
          setError(reason instanceof Error ? reason.message : 'Local GCG service is unavailable.');
        }
      }
      if (active) timer = setTimeout(() => { void poll(); }, 1000);
    }
    void poll();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [board, mode, paused]);

  const mock = snapshot?.source === 'mock';
  const source = paused ? 'Paused' : snapshot?.source === 'live' ? 'Live sensor'
    : snapshot?.status === 'backup' ? 'Mock backup' : mock ? 'Mock demo' : snapshot ? 'Sensor offline' : error ? 'Unavailable' : 'Connecting';
  const updated = snapshot ? new Date(snapshot.updatedAt * 1000).toLocaleTimeString() : 'Waiting for data';

  function chooseMode(next: GcgMode) {
    setMode(next);
    setPaused(false);
    setSnapshot(null);
    setError('');
  }

  function connect() {
    const address = boardInput.trim();
    setBoard(address);
    setPaused(false);
    setSnapshot(null);
    setError('');
    void localDeviceStorage.setItem(BOARD_KEY, address).catch(() => {});
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <PageIntro eyebrow="LIVE SENSOR" title="GCG" description="Gyrocardiography from the wrist motion sensor." />
      <GlassPanel style={styles.panel}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Sensor connection</Text>
          <View style={[styles.source, mock && styles.mockSource]}>
            <Text accessibilityLiveRegion="polite" style={styles.sourceText}>{source}</Text>
          </View>
        </View>
        <View style={styles.controls}>
          {modes.map((item) => (
            <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: mode === item.value }}
              onPress={() => chooseMode(item.value)} style={[styles.choice, mode === item.value && styles.selected]}>
              <Text style={[styles.choiceText, mode === item.value && styles.selectedText]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>UNO Q address</Text>
        <View style={styles.addressRow}>
          <TextInput accessibilityLabel="UNO Q sensor address" autoCapitalize="none" autoCorrect={false}
            keyboardType="url" value={boardInput} onChangeText={setBoardInput} onSubmitEditing={connect}
            style={styles.input} placeholder={DEFAULT_BOARD} placeholderTextColor={colors.muted} />
          <AppButton onPress={connect}><Text style={styles.primaryText}>Connect</Text></AppButton>
        </View>
        <Text style={styles.copy}>
          {mode === 'auto' ? 'Live sensor data takes priority. Mock backup starts when the sensor is offline or its samples stop updating.'
            : mode === 'mock' ? 'Demo mode shows simulated sensor readings.' : 'Sensor-only mode waits for real readings from the board.'}
        </Text>
        {snapshot?.status === 'backup' ? <Text style={styles.warning}>Showing simulated backup. Retrying the sensor automatically.</Text> : null}
        {error || snapshot?.error ? <Text accessibilityRole="alert" style={styles.copy}>{error || snapshot?.error}</Text> : null}
      </GlassPanel>

      <View style={styles.metrics}>
        <Metric label={mock ? 'Simulated heart rate' : 'Heart rate'} value={snapshot?.bpm == null ? 'Unavailable' : `${snapshot.bpm.toFixed(1)} BPM`} />
        <Metric label={mock ? 'Simulated sample rate' : 'Sample rate'} value={snapshot?.sampleRateHz == null ? 'Unavailable' : `${snapshot.sampleRateHz.toFixed(1)} Hz`} />
        <Metric label={mock ? 'Simulated signal quality' : 'Signal quality'} value={snapshot?.quality == null ? 'Unavailable' : `${(snapshot.quality * 100).toFixed(0)}% clean`} />
      </View>

      <GlassPanel style={styles.panel}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.heading}>GCG monitor</Text>
            <Text style={styles.copy}>{mock ? 'Simulated waveform' : 'Sensor waveform'} · {group === 'gyro' ? 'Gyroscope · °/s' : 'Accelerometer · g'}</Text>
          </View>
          <AppButton compact variant="quiet" onPress={() => setPaused((value) => !value)}>
            <Text style={styles.copy}>{paused ? 'Resume' : 'Pause'}</Text>
          </AppButton>
        </View>
        <View style={styles.controls}>
          {(['gyro', 'accel'] as const).map((item) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: group === item }} key={item}
              onPress={() => setGroup(item)} style={[styles.choice, group === item && styles.selected]}>
              <Text style={[styles.choiceText, group === item && styles.selectedText]}>{item === 'gyro' ? 'Gyroscope' : 'Accelerometer'}</Text>
            </Pressable>
          ))}
          {axes.map((axis) => <Text key={axis.label} style={[styles.axis, { color: axis.color }]}>{axis.label}</Text>)}
        </View>
        <GcgWaveform snapshot={snapshot} group={group} />
        <View style={styles.headingRow}>
          <Text style={styles.copy}>{snapshot?.model || 'Waiting for sensor service'}</Text>
          <Text style={styles.copy}>Updated {updated}</Text>
        </View>
      </GlassPanel>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <GlassPanel style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></GlassPanel>;
}

function GcgWaveform({ snapshot, group }: { snapshot: GcgSnapshot | null; group: 'gyro' | 'accel' }) {
  const plot = useMemo(() => {
    const samples = snapshot?.samples ?? [];
    if (samples.length < 2) return null;
    const channels: GcgChannel[] = group === 'gyro' ? ['gx', 'gy', 'gz'] : ['ax', 'ay', 'az'];
    const times = samples.map((sample) => sample.t).filter((value): value is number => value != null);
    if (times.length < 2) return null;
    const start = times[0];
    const duration = Math.max(1, times[times.length - 1] - start);
    const values = samples.flatMap((sample) => channels.map((channel) => sample[channel])).filter((value): value is number => value != null);
    if (!values.length) return null;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = Math.max((maximum - minimum) * 0.1, 0.001);
    const low = minimum - padding;
    const high = maximum + padding;
    const paths = channels.map((channel) => {
      let path = '';
      let connected = false;
      for (const sample of samples) {
        const value = sample[channel];
        if (sample.t == null || value == null) { connected = false; continue; }
        const x = 58 + (sample.t - start) / duration * 920;
        const y = 260 - (value - low) / (high - low) * 235;
        path += `${connected ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
        connected = true;
      }
      return path;
    });
    return { paths, low, high, seconds: duration / 1000 };
  }, [snapshot, group]);

  return (
    <View style={styles.chart} accessibilityRole="image" accessibilityLabel={`${snapshot?.source === 'mock' ? 'Simulated' : 'Live'} three-axis ${group} waveform`}>
      {plot ? (
        <Svg width="100%" height="100%" viewBox="0 0 1000 290" preserveAspectRatio="none">
          {Array.from({ length: 9 }, (_, index) => <Line key={`h${index}`} x1={58} x2={978} y1={25 + index * 235 / 8} y2={25 + index * 235 / 8} stroke="#294353" />)}
          {Array.from({ length: 19 }, (_, index) => <Line key={`v${index}`} x1={58 + index * 920 / 18} x2={58 + index * 920 / 18} y1={25} y2={260} stroke="#294353" />)}
          {plot.paths.map((path, index) => <Path key={axes[index].label} d={path} fill="none" stroke={axes[index].color} strokeWidth={1.7} />)}
          <SvgText x={3} y={30} fill="#CAF0F8" fontSize={11}>{plot.high.toFixed(3)}</SvgText>
          <SvgText x={3} y={260} fill="#CAF0F8" fontSize={11}>{plot.low.toFixed(3)}</SvgText>
          <SvgText x={58} y={282} fill="#CAF0F8" fontSize={11}>−{plot.seconds.toFixed(1)} s</SvgText>
          <SvgText x={978} y={282} fill="#CAF0F8" fontSize={11} textAnchor="end">Now</SvgText>
        </Svg>
      ) : snapshot ? <Text style={styles.copy}>Waiting for sensor samples.</Text> : <ActivityIndicator color={colors.accent} />}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 64, gap: 16 },
  panel: { gap: 12 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  headingCopy: { gap: 4 },
  heading: { color: colors.text, fontWeight: '800', fontSize: 19 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  copy: { color: colors.text, fontSize: 13, lineHeight: 20 },
  warning: { color: '#FFC857', fontSize: 14 },
  source: { backgroundColor: colors.cyanSoft, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  mockSource: { borderColor: '#FFC857' },
  sourceText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  choice: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  selectedText: { color: colors.accentText },
  addressRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flex: 1, minWidth: 210, minHeight: 48, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 15, backgroundColor: colors.scrim, borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  primaryText: { color: colors.accentText, fontWeight: '800', fontSize: 14 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flex: 1, minWidth: 180, gap: 6 },
  value: { color: colors.text, fontWeight: '800', fontSize: 24 },
  axis: { fontWeight: '800', fontSize: 13, paddingHorizontal: 6 },
  chart: { height: 300, width: '100%', backgroundColor: '#12283A', borderWidth: 1, borderColor: '#294353', borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
});
