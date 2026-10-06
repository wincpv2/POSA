import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureStateChangeEvent, type PanGestureHandlerEventPayload, type PinchGestureHandlerEventPayload } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Rect, SvgXml, Text as SvgText } from 'react-native-svg';
import { AppButton, PosaText as Text, pressX } from '@/components/posa-ui';
import type { SignalMinute } from '@/lib/inference';
import type { EcgSymptomEvent } from '@/lib/queries';

const VIEW_WINDOWS = [2.5, 5, 10, 20, 40, 80];
const plot = { left: 48, right: 990, top: 20, bottom: 290 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number) => Number.isFinite(value);
const nearestWindow = (wanted: number) => VIEW_WINDOWS.reduce((best, candidate) => Math.abs(candidate - wanted) < Math.abs(best - wanted) ? candidate : best, VIEW_WINDOWS[0]);
const timeLabel = (seconds: number) => {
  const value = Math.max(0, Math.floor(finite(seconds) ? seconds : 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

type Interval = { startSeconds: number; endSeconds: number };

type WaveformProps = {
  signal: SignalMinute | null;
  signalPending: boolean;
  signalError: string;
  chartHeight?: number;
  chartFlex?: boolean;
  onRetry: () => void;
  currentMinute: number;
  currentSecond: number;
  totalDuration: number;
  viewStartSec: number;
  viewSeconds: number;
  playing: boolean;
  apneaIntervals: Interval[];
  events: EcgSymptomEvent[];
  uploadId: string | undefined;
  selectedPeak: { minute: number; index: number } | null;
  onSelectedPeak: (peak: { minute: number; index: number } | null) => void;
  onViewStart: (seconds: number) => void;
  onViewSeconds: (seconds: number) => void;
  onPlaying: (playing: boolean) => void;
  onSeek: (seconds: number) => void;
};

export function EcgWaveform(props: WaveformProps) {
  const {
    signal, signalPending, signalError, onRetry, currentMinute, currentSecond,
    totalDuration, viewStartSec, viewSeconds, playing,
    apneaIntervals, events, uploadId, selectedPeak, onSelectedPeak,
    onViewStart, onViewSeconds, onPlaying, onSeek,
  } = props;
  const [chartWidth, setChartWidth] = useState(0);
  const chartRef = useRef<View>(null);
  const chartWidthRef = useRef(0);
  const viewStartRef = useRef(viewStartSec);
  const viewSecondsRef = useRef(viewSeconds);
  const minuteDurationRef = useRef(60);
  const panOriginRef = useRef(0);
  const pinchOriginRef = useRef(10);
  const pinchAnchorTimeRef = useRef(0);
  const pinchAnchorRatioRef = useRef(0.5);
  const interactionRef = useRef<{
    zoomAt: (direction: -1 | 1, anchorRatio: number) => void;
    zoomToWindow: (wanted: number, anchorTime: number, anchorRatio: number) => void;
    panBy: (deltaX: number) => void;
    seekAtRatio: (chartRatio: number) => void;
    stopPlayback: () => void;
  } | null>(null);

  useEffect(() => { chartWidthRef.current = chartWidth; }, [chartWidth]);
  useEffect(() => { viewStartRef.current = viewStartSec; }, [viewStartSec]);
  useEffect(() => { viewSecondsRef.current = viewSeconds; }, [viewSeconds]);
  useEffect(() => {
    const rate = signal?.samplingRateHz;
    const seconds = signal && typeof rate === 'number' && finite(rate) && rate > 0 ? signal.samples.length / rate : 60;
    minuteDurationRef.current = finite(seconds) && seconds > 0 ? seconds : 60;
  }, [signal]);

  const plotted = useMemo(() => {
    if (!signal || signal.uploadId !== uploadId || signal.minuteIndex !== currentMinute) return null;
    const rate = signal.samplingRateHz;
    if (!finite(rate) || rate <= 0 || !signal.samples.length) return null;
    const duration = signal.samples.length / rate;
    if (!finite(duration) || duration <= 0) return null;
    const span = Math.min(viewSeconds, duration);
    if (!finite(span) || span <= 0) return null;
    const followStart = clamp(currentSecond - span * 0.85, 0, Math.max(0, duration - span));
    const start = playing ? followStart : clamp(viewStartSec, 0, Math.max(0, duration - span));
    const end = Math.min(duration, start + span);
    const first = Math.max(0, Math.floor(start * rate));
    const last = Math.min(signal.samples.length, Math.ceil(end * rate));
    const indices: number[] = [];
    const bucketSize = Math.max(1, Math.ceil(Math.max(1, last - first) / 1000));
    for (let bucketStart = first; bucketStart < last; bucketStart += bucketSize) {
      const bucketEnd = Math.min(last, bucketStart + bucketSize);
      let minimumIndex = -1;
      let maximumIndex = -1;
      for (let index = bucketStart; index < bucketEnd; index++) {
        const value = signal.samples[index];
        if (!finite(value)) continue;
        if (minimumIndex < 0 || value < signal.samples[minimumIndex]) minimumIndex = index;
        if (maximumIndex < 0 || value > signal.samples[maximumIndex]) maximumIndex = index;
      }
      if (minimumIndex < 0) continue;
      if (minimumIndex === maximumIndex) indices.push(minimumIndex);
      else indices.push(...(minimumIndex < maximumIndex ? [minimumIndex, maximumIndex] : [maximumIndex, minimumIndex]));
    }
    if (!indices.length) return null;
    const envelope = indices.map((index) => signal.samples[index]).sort((a, b) => a - b);
    let low = envelope[Math.floor((envelope.length - 1) * 0.002)];
    let high = envelope[Math.ceil((envelope.length - 1) * 0.998)];
    if (!finite(low) || !finite(high)) return null;
    const amplitude = Math.max(high - low, 1e-6);
    low -= amplitude * 0.08;
    high += amplitude * 0.08;
    const displayRange = high - low;
    const plotStart = Math.min(start, Math.max(0, duration - span));
    const plotSpan = Math.max(0.001, Math.min(span, duration - plotStart));
    const majorStep = viewSeconds <= 2.5 ? 0.5 : viewSeconds <= 5 ? 1 : viewSeconds <= 10 ? 2 : viewSeconds <= 20 ? 5 : viewSeconds <= 40 ? 10 : 20;
    const minorStep = majorStep / 5;
    const xGrid: { x: number; major: boolean }[] = [];
    let tick = Math.ceil((plotStart - 1e-8) / minorStep) * minorStep;
    let count = 0;
    while (tick <= plotStart + plotSpan + 1e-8 && count++ < 500) {
      const major = Math.abs(tick / majorStep - Math.round(tick / majorStep)) < 1e-6;
      xGrid.push({ x: plot.left + (tick - plotStart) / plotSpan * (plot.right - plot.left), major });
      tick += minorStep;
    }
    const y = (value: number) => clamp(plot.bottom - (value - low) / displayRange * (plot.bottom - plot.top), plot.top, plot.bottom);
    const path = indices.map((index, offset) => {
      const x = plot.left + clamp((index / rate - plotStart) / plotSpan, 0, 1) * (plot.right - plot.left);
      return `${offset ? 'L' : 'M'}${x.toFixed(1)} ${y(signal.samples[index]).toFixed(1)}`;
    }).join(' ');
    const peaks = signal.rPeakSamples
      .map((sample, index) => ({ sample, index }))
      .filter(({ sample }) => Number.isInteger(sample) && sample >= 0 && sample < signal.samples.length && sample / rate >= plotStart && sample / rate <= plotStart + plotSpan && finite(signal.samples[sample]))
      .map(({ sample, index }) => ({
        index,
        selected: selectedPeak?.minute === currentMinute && selectedPeak.index === index,
        neighbor: selectedPeak?.minute === currentMinute && Math.abs(selectedPeak.index - index) === 1,
        x: plot.left + (sample / rate - plotStart) / plotSpan * (plot.right - plot.left),
        y: y(signal.samples[sample]),
      }));
    const absoluteStart = currentMinute * 60 + plotStart;
    const absoluteEnd = absoluteStart + plotSpan;
    const apneaSpans = apneaIntervals
      .filter((item) => finite(item.startSeconds) && finite(item.endSeconds) && item.endSeconds > item.startSeconds && item.startSeconds < absoluteEnd && item.endSeconds > absoluteStart)
      .map((item) => {
        const left = Math.max(item.startSeconds, absoluteStart);
        const right = Math.min(item.endSeconds, absoluteEnd);
        return {
          x: plot.left + (left - absoluteStart) / plotSpan * (plot.right - plot.left),
          width: (right - left) / plotSpan * (plot.right - plot.left),
        };
      });
    const cursor = currentSecond >= plotStart && currentSecond <= plotStart + plotSpan
      ? plot.left + (currentSecond - plotStart) / plotSpan * (plot.right - plot.left)
      : null;
    const symptomMarkers = events
      .filter((event) => event.ecg_upload_id === uploadId && finite(event.occurred_at_seconds) && Math.floor(event.occurred_at_seconds / 60) === currentMinute)
      .map((event) => event.occurred_at_seconds % 60)
      .filter((second) => second >= plotStart && second <= plotStart + plotSpan)
      .map((second) => plot.left + (second - plotStart) / plotSpan * (plot.right - plot.left));
    return {
      path,
      xGrid,
      low,
      high,
      peaks,
      apneaSpans,
      cursor,
      symptomMarkers,
      plotStart,
      plotSpan,
      start: currentMinute * 60 + plotStart,
      end: currentMinute * 60 + plotStart + plotSpan,
      duration,
      rate,
    };
  }, [signal, uploadId, currentMinute, currentSecond, viewSeconds, viewStartSec, playing, events, apneaIntervals, selectedPeak]);

  const zoomAt = useCallback((direction: -1 | 1, anchorRatio: number) => {
    const index = VIEW_WINDOWS.indexOf(viewSecondsRef.current);
    const next = VIEW_WINDOWS[clamp(index + direction, 0, VIEW_WINDOWS.length - 1)];
    if (next === viewSecondsRef.current) return;
    const duration = minuteDurationRef.current;
    const oldSpan = Math.min(viewSecondsRef.current, duration);
    const nextSpan = Math.min(next, duration);
    const ratio = clamp(anchorRatio, 0, 1);
    const anchorTime = viewStartRef.current + ratio * oldSpan;
    const nextStart = clamp(anchorTime - ratio * nextSpan, 0, Math.max(0, duration - nextSpan));
    onViewSeconds(next);
    onViewStart(nextStart);
    onPlaying(false);
  }, [onViewSeconds, onViewStart, onPlaying]);

  const zoomToWindow = useCallback((wanted: number, anchorTime: number, anchorRatio: number) => {
    const duration = minuteDurationRef.current;
    const next = nearestWindow(wanted);
    const span = Math.min(next, duration);
    const ratio = clamp(anchorRatio, 0, 1);
    onViewSeconds(next);
    onViewStart(clamp(anchorTime - ratio * span, 0, Math.max(0, duration - span)));
    onPlaying(false);
  }, [onViewSeconds, onViewStart, onPlaying]);

  const panBy = useCallback((deltaX: number) => {
    const width = chartWidthRef.current;
    const duration = minuteDurationRef.current;
    const span = Math.min(viewSecondsRef.current, duration);
    if (!finite(width) || width <= 0 || !finite(deltaX)) return;
    onViewStart(clamp(panOriginRef.current - deltaX / width * span, 0, Math.max(0, duration - span)));
  }, [onViewStart]);

  const seekAtRatio = useCallback((chartRatio: number) => {
    if (!plotted || !signal) return;
    const plotRatio = clamp((chartRatio * 1000 - plot.left) / (plot.right - plot.left), 0, 1);
    const target = plotted.plotStart + plotRatio * plotted.plotSpan;
    const peaks = signal.rPeakSamples;
    let closest = -1;
    for (let index = 0; index < peaks.length; index++) {
      const sample = peaks[index];
      if (!Number.isInteger(sample) || sample < 0 || sample >= signal.samples.length) continue;
      if (closest < 0 || Math.abs(sample / plotted.rate - target) < Math.abs(peaks[closest] / plotted.rate - target)) closest = index;
    }
    const tolerance = Math.min(0.3, Math.max(0.08, viewSeconds / 40));
    const peakTime = closest >= 0 ? peaks[closest] / plotted.rate : NaN;
    const selectPeak = closest >= 0 && Math.abs(peakTime - target) <= tolerance;
    const localTarget = selectPeak ? peakTime : target;
    onSeek(clamp(currentMinute * 60 + localTarget, 0, Math.max(0, totalDuration - 0.001)));
    onPlaying(false);
    onSelectedPeak(selectPeak ? { minute: currentMinute, index: closest } : null);
    if (localTarget < viewStartSec || localTarget > viewStartSec + viewSeconds) {
      const span = Math.min(viewSeconds, plotted.duration);
      onViewStart(clamp(localTarget - span / 2, 0, Math.max(0, plotted.duration - span)));
    }
  }, [plotted, signal, viewSeconds, currentMinute, totalDuration, onSeek, onPlaying, onSelectedPeak, viewStartSec, onViewStart]);

  useEffect(() => {
    interactionRef.current = { zoomAt, zoomToWindow, panBy, seekAtRatio, stopPlayback: () => onPlaying(false) };
  }, [zoomAt, zoomToWindow, panBy, seekAtRatio, onPlaying]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = chartRef.current as unknown as HTMLElement | null;
    if (!element?.addEventListener) return;
    const originalTouchAction = element.style.touchAction;
    element.style.touchAction = 'pan-y';
    const pointers = new Map<number, { x: number; y: number }>();
    let pointerStart: { id: number; x: number; y: number; moved: boolean } | null = null;
    let pinchStart: { distance: number; window: number; anchorTime: number; anchorRatio: number } | null = null;
    const point = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? -1 : 1;
      const index = VIEW_WINDOWS.indexOf(viewSecondsRef.current);
      if ((direction < 0 && index === 0) || (direction > 0 && index === VIEW_WINDOWS.length - 1)) return;
      const location = point(event as unknown as PointerEvent);
      const ratio = (location.x / Math.max(1, location.width) * 1000 - plot.left) / (plot.right - plot.left);
      interactionRef.current?.zoomAt(direction, ratio);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const location = point(event);
      pointers.set(event.pointerId, { x: location.x, y: location.y });
      element.setPointerCapture?.(event.pointerId);
      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()];
        const focalX = (first.x + second.x) / 2;
        const ratio = clamp(focalX / Math.max(1, location.width), 0, 1);
        const window = viewSecondsRef.current;
        pinchStart = {
          distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          window,
          anchorTime: viewStartRef.current + ratio * Math.min(window, minuteDurationRef.current),
          anchorRatio: ratio,
        };
        pointerStart = null;
        interactionRef.current?.stopPlayback();
        return;
      }
      if (pointers.size > 2) return;
      pointerStart = { id: event.pointerId, x: location.x, y: location.y, moved: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) {
        const location = point(event);
        pointers.set(event.pointerId, { x: location.x, y: location.y });
        if (pinchStart && pointers.size >= 2) {
          const [first, second] = [...pointers.values()];
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
          interactionRef.current?.zoomToWindow(pinchStart.window * pinchStart.distance / distance, pinchStart.anchorTime, pinchStart.anchorRatio);
          return;
        }
      }
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const location = point(event);
      const dx = location.x - pointerStart.x;
      if (!pointerStart.moved && Math.abs(dx) < 5 && Math.abs(location.y - pointerStart.y) < 5) return;
      if (!pointerStart.moved) {
        pointerStart.moved = true;
        panOriginRef.current = viewStartRef.current;
        interactionRef.current?.stopPlayback();
      }
      interactionRef.current?.panBy(dx);
    };
    const onPointerUp = (event: PointerEvent) => {
      const wasPinching = pinchStart != null;
      pointers.delete(event.pointerId);
      if (wasPinching) {
        pinchStart = null;
        pointerStart = null;
        return;
      }
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      if (!pointerStart.moved) {
        const location = point(event);
        interactionRef.current?.seekAtRatio(location.x / Math.max(1, location.width));
      }
      pointerStart = null;
    };
    const onPointerCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pointerStart = null;
      pinchStart = null;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    return () => {
      element.style.touchAction = originalTouchAction;
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);

  const onPanBegin = useCallback(() => {
    panOriginRef.current = viewStartRef.current;
    onPlaying(false);
  }, [onPlaying]);
  const onPanEnd = useCallback((event: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => panBy(event.translationX), [panBy]);
  const onPinchBegin = useCallback((event: GestureStateChangeEvent<PinchGestureHandlerEventPayload>) => {
    const width = chartWidthRef.current || 1;
    pinchOriginRef.current = viewSecondsRef.current;
    pinchAnchorRatioRef.current = clamp(event.focalX / width, 0, 1);
    pinchAnchorTimeRef.current = viewStartRef.current + pinchAnchorRatioRef.current * viewSecondsRef.current;
    onPlaying(false);
  }, [onPlaying]);
  const onPinchEnd = useCallback((event: GestureStateChangeEvent<PinchGestureHandlerEventPayload>) => {
    const wanted = pinchOriginRef.current / Math.max(event.scale, 0.01);
    zoomToWindow(wanted, pinchAnchorTimeRef.current, pinchAnchorRatioRef.current);
  }, [zoomToWindow]);

  const gesture = useMemo(() => {
    // These callbacks read refs only when the user performs the gesture.
    // eslint-disable-next-line react-hooks/refs
    const pan = Gesture.Pan().activeOffsetX([-8, 8]).failOffsetY([-8, 8]).runOnJS(true).onBegin(onPanBegin).onEnd(onPanEnd);
    // eslint-disable-next-line react-hooks/refs
    const pinch = Gesture.Pinch().runOnJS(true).onBegin(onPinchBegin).onEnd(onPinchEnd);
    return Gesture.Simultaneous(pan, pinch);
  }, [onPanBegin, onPanEnd, onPinchBegin, onPinchEnd]);

  const chart = <View
    ref={chartRef}
    onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
    style={[styles.chart, props.chartFlex ? styles.chartFlex : styles.chartFixed, props.chartHeight ? { height: props.chartHeight, minHeight: 150 } : null]}
    accessibilityRole="image"
    accessibilityLabel={`ECG waveform for minute ${currentMinute + 1}. Scroll to zoom, drag horizontally to pan, tap near an R peak to inspect it.`}
  >
    {plotted ? <Svg width="100%" height="100%" viewBox="0 0 1000 320" preserveAspectRatio="none">
      <Rect width="1000" height="320" fill="#102333" />
      {plotted.apneaSpans.map((span, index) => <Rect key={`apnea-bg${index}`} x={span.x} y={plot.top} width={Math.max(1, span.width)} height={plot.bottom - plot.top} fill="#F16A78" opacity={0.16} />)}
      {Array.from({ length: 16 }, (_, index) => <Line key={`h${index}`} x1={plot.left} x2={plot.right} y1={plot.top + index * (plot.bottom - plot.top) / 15} y2={plot.top + index * (plot.bottom - plot.top) / 15} stroke={index % 5 === 0 ? '#3B5668' : '#263D4D'} strokeWidth={index % 5 === 0 ? 1.2 : 0.75} />)}
      {plotted.xGrid.map((line, index) => <Line key={`v${index}`} x1={line.x} x2={line.x} y1={plot.top} y2={plot.bottom} stroke={line.major ? '#3B5668' : '#263D4D'} strokeWidth={line.major ? 1.2 : 0.75} />)}
      {plotted.symptomMarkers.map((x, index) => <Line key={`s${index}`} x1={x} x2={x} y1={plot.top} y2={plot.bottom} stroke="#FFC857" strokeDasharray="4 4" strokeWidth={1.5} />)}
      <Path d={plotted.path} fill="none" stroke="#53D5C5" strokeWidth={2.3} />
      {plotted.peaks.map((peak) => <Circle key={`r${peak.index}`} cx={peak.x} cy={peak.y} r={peak.selected ? 6 : peak.neighbor ? 4.5 : 3.5} fill={peak.neighbor ? '#102333' : '#FFC857'} stroke={peak.neighbor ? '#53D5C5' : '#102333'} strokeWidth={peak.selected || peak.neighbor ? 1.5 : 1} />)}
      {plotted.cursor == null ? null : <Line x1={plotted.cursor} x2={plotted.cursor} y1={plot.top} y2={plot.bottom} stroke="#E8F3F2" strokeWidth={1} opacity={0.85} />}
      <SvgText x={plot.left} y={312} fill="#B5CAD6" fontSize="12">{timeLabel(plotted.start)}</SvgText>
      <SvgText x={plot.right} y={312} fill="#B5CAD6" fontSize="12" textAnchor="end">{timeLabel(plotted.end)}</SvgText>
      <SvgText x={5} y={plot.top + 5} fill="#B5CAD6" fontSize="11">{plotted.high.toFixed(2)} {signal?.unit || 'relative'}</SvgText>
      <SvgText x={5} y={plot.bottom} fill="#B5CAD6" fontSize="11">{plotted.low.toFixed(2)} {signal?.unit || 'relative'}</SvgText>
    </Svg> : signalPending ? <ActivityIndicator color="#49E3A0" /> : <View style={styles.chartError}>
      <Text style={styles.chartMessage}>{signalError || 'No ECG samples available for this time.'}</Text>
      {signalError ? <AppButton compact variant="quiet" onPress={onRetry}><Text style={styles.link}>Retry signal</Text></AppButton> : null}
    </View>}
  </View>;

  return <>
    {Platform.OS === 'web' ? chart : <GestureDetector gesture={gesture}>
      <Pressable onPress={(event) => {
        const x = pressX(event);
        if (x != null) seekAtRatio(x / Math.max(1, chartWidth));
      }}>{chart}</Pressable>
    </GestureDetector>}
  </>;
}

type OverviewProps = {
  duration: number;
  playheadSec: number;
  viewStartSec: number;
  viewSeconds: number;
  timelineHeight?: number;
  overviewSvg?: string;
  onSeek: (seconds: number) => void;
};

export function RecordingOverview({ duration, playheadSec, viewStartSec, viewSeconds, timelineHeight = 132, overviewSvg, onSeek }: OverviewProps) {
  const [overviewWidth, setOverviewWidth] = useState(0);
  const safeDuration = finite(duration) && duration > 0 ? duration : 1;
  const safePlayhead = finite(playheadSec) ? clamp(playheadSec, 0, safeDuration) : 0;
  const safeViewSeconds = finite(viewSeconds) && viewSeconds > 0 ? viewSeconds : Math.min(10, safeDuration);
  const absoluteViewStart = finite(viewStartSec) ? clamp(viewStartSec, 0, safeDuration) : 0;
  const viewX = clamp(absoluteViewStart / safeDuration, 0, 1) * 1000;
  const viewWidth = Math.max(2, Math.min(Math.min(safeViewSeconds, safeDuration) / safeDuration * 1000, 1000 - viewX));
  const playheadX = safePlayhead / safeDuration * 1000;
  const onPress = (event: GestureResponderEvent) => {
    const x = pressX(event);
    if (x != null && overviewWidth > 0) onSeek(clamp(x / overviewWidth * safeDuration, 0, safeDuration));
  };

  return <Pressable accessibilityRole="button" accessibilityLabel="Full recording timeline. Tap to seek to that point." onLayout={(event) => setOverviewWidth(event.nativeEvent.layout.width)} onPress={onPress} style={[styles.timeline, { height: timelineHeight }]}>
    {overviewSvg ? <SvgXml xml={overviewSvg} width="100%" height={timelineHeight} preserveAspectRatio="none" /> : <View style={[styles.overviewPlaceholder, { height: timelineHeight }]}><Text style={styles.chartMessage}>Loading Python timeline…</Text></View>}
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={timelineHeight} viewBox="0 0 1000 132" preserveAspectRatio="none">
      <Rect x={clamp(playheadX - 1, 0, 998)} y={18} width={2} height={72} fill="#F4F7F7" />
      <Rect x={viewX} y={18} width={viewWidth} height={72} fill="#49E3A0" fillOpacity={0.08} stroke="#20b781" strokeWidth={1.5} />
    </Svg>
  </Pressable>;
}

const styles = StyleSheet.create({
  chart: { width: '100%', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#314B5D', alignItems: 'center', justifyContent: 'center' },
  chartFixed: { height: 340, minHeight: 260 },
  chartFlex: { flex: 1, minHeight: 240 },
  chartError: { alignItems: 'center', gap: 4 },
  chartMessage: { color: '#A9C3C5', fontSize: 14, padding: 20, textAlign: 'center' },
  chartHint: { color: '#A9C3C5', fontSize: 12, lineHeight: 18 },
  link: { color: '#D7E9E9', fontSize: 14, fontWeight: '700' },
  timeline: { width: '100%', height: 132, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  overviewPlaceholder: { height: 132, justifyContent: 'center', alignItems: 'center' },
});
