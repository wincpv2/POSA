import { router, useLocalSearchParams } from 'expo-router';
import { Picker } from '@expo/ui/community/picker';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { AppButton, GlassPanel, PageIntro, PosaText as Text, pressX } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors, fonts } from '@/components/posa-theme';

const plot = { left: 78, right: 980, top: 46, bottom: 420 };
const eventRed = '#D1495B';
const seconds = (value: string) => value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
const timeLabel = (n: number) => { const s = Math.max(0, Math.floor(n)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export default function DetailScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { study } = useUploadState();
  const params = useLocalSearchParams<{ time?: string }>();
  const sample = study.metadata.includes('Sample record');
  const durationSeconds = study.duration ? seconds(study.duration) : 8 * 3600 + 30 * 60;
  const requested = Number(params.time);
  const [current, setCurrent] = useState(Number.isFinite(requested) ? Math.max(0, Math.min(durationSeconds, requested)) : 5);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [signal, setSignal] = useState('Filtered');
  const [windowSize, setWindowSize] = useState('2.5');
  const [zoom, setZoom] = useState(1);
  const [chartWidth, setChartWidth] = useState(1);
  const [timelineWidth, setTimelineWidth] = useState(1);
  const visibleSeconds = Number(windowSize) / zoom;
  const start = Math.max(0, Math.min(durationSeconds - visibleSeconds, current - visibleSeconds / 2));
  const end = start + visibleSeconds;
  const rrInterval = 640;
  const heartRate = sample ? 95 : 0;
  const peaks = useMemo(() => {
    const result: { time: number; x: number; y: number }[] = [];
    for (let t = Math.ceil(start / (rrInterval / 1000)) * (rrInterval / 1000); t <= end; t += rrInterval / 1000) {
      const phase = (t * 1000 % rrInterval) / rrInterval;
      const value = -0.22 + Math.exp(-Math.pow((phase - 0.36) / 0.035, 2)) * 2.95;
      result.push({ time: t, x: plot.left + (t - start) / visibleSeconds * (plot.right - plot.left), y: plot.bottom - (value + 0.6) * 80 });
    }
    return result;
  }, [start, end, visibleSeconds]);
  const wavePath = useMemo(() => {
    const count = 340;
    return Array.from({ length: count }, (_, index) => {
      const x = plot.left + index / (count - 1) * (plot.right - plot.left);
      const t = start + index / (count - 1) * visibleSeconds;
      const phase = (t * 1000 % rrInterval) / rrInterval;
      const qrs = Math.exp(-Math.pow((phase - 0.36) / 0.035, 2)) * 2.95;
      const p = Math.exp(-Math.pow((phase - 0.16) / 0.08, 2)) * 0.22;
      const tWave = Math.exp(-Math.pow((phase - 0.68) / 0.13, 2)) * 0.34;
      const value = -0.22 + Math.sin(t * 2.4) * 0.06 + p + qrs + tWave;
      const y = plot.bottom - (value + 0.6) * 80;
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, [start, visibleSeconds]);
  const playbackActive = playing && current < durationSeconds;
  useEffect(() => {
    if (!playbackActive) return;
    const timer = setInterval(() => setCurrent((value) => Math.min(durationSeconds, value + 0.25 * Number(speed))), 250);
    return () => clearInterval(timer);
  }, [playbackActive, speed, durationSeconds]);

  const moveEvent = (direction: -1 | 1) => {
    const event = direction > 0
      ? study.events.find((item) => seconds(item.start) > current)
      : [...study.events].reverse().find((item) => seconds(item.start) < current);
    if (event) setCurrent(seconds(event.start));
  };
  const seekTo = (t: number) => { if (Number.isFinite(t)) setCurrent(Math.max(0, Math.min(durationSeconds, t))); };
  const seekPlot = (x: number) => seekTo(start + x / Math.max(chartWidth, 1) * visibleSeconds);
  const seekNight = (x: number) => seekTo(x / Math.max(timelineWidth, 1) * durationSeconds);

  if (study.status !== 'ready') return <View style={styles.gate}><Text style={styles.title}>No completed study to inspect</Text><Text style={styles.copy}>Upload a recording and finish the preview first.</Text><AppButton href="/upload"><Text style={styles.buttonText}>Go to upload</Text></AppButton></View>;

  const meta = [study.sampleRate ? `${study.sampleRate} Hz` : null, study.lead || null, study.age ? `${study.age} y` : null, study.sex || null].filter(Boolean).join(' · ') || 'Recording details unavailable';

  return <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, wide && styles.pageWide]}>
    <PageIntro eyebrow="STUDY DETAIL" title={study.studyId || 'Study'} description={meta} />

    <View style={styles.stats}>
      <Stat label="Elapsed time" value={timeLabel(current)} sub={`of ${timeLabel(durationSeconds)}`} />
      <Stat label="Heart rate" value={sample ? `${heartRate} bpm` : '—'} sub={sample ? 'Illustrative sample' : 'Needs ECG samples'} />
      <Stat label="Classification" value={sample ? 'NORMAL · N' : 'Unavailable'} sub={sample ? 'At the current time' : 'Model not connected'} tone={sample ? 'good' : 'muted'} />
    </View>

    {sample ? <>
      <GlassPanel style={styles.toolbar}>
        <Group title="Playback">
          <Control label={playbackActive ? '❚❚ Pause' : '▶ Play'} onPress={() => { if (playbackActive) setPlaying(false); else { if (current >= durationSeconds) setCurrent(0); setPlaying(true); } }} active={playbackActive}/>
          <Picker selectedValue={speed} onValueChange={(value) => setSpeed(String(value))} style={styles.picker}>{['0.5','1','2'].map((value) => <Picker.Item key={value} value={value} label={`${value}× speed`}/>)}</Picker>
        </Group>
        <Group title="View">
          <Picker selectedValue={signal} onValueChange={(value) => setSignal(String(value))} style={styles.picker}>{['Filtered','Raw'].map((value) => <Picker.Item key={value} value={value} label={value}/>)}</Picker>
          <Picker selectedValue={windowSize} onValueChange={(value) => setWindowSize(String(value))} style={styles.picker}>{['2.5','5','10'].map((value) => <Picker.Item key={value} value={value} label={`${value} s window`}/>)}</Picker>
          <View style={styles.zoom}>
            <Control label="−" onPress={() => setZoom((value) => Math.max(1, value - 1))} disabled={zoom === 1} square/>
            <Text style={styles.zoomValue}>×{zoom}</Text>
            <Control label="+" onPress={() => setZoom((value) => Math.min(4, value + 1))} disabled={zoom === 4} square/>
          </View>
        </Group>
        <Group title="Apnea events">
          <Control label="◀ Previous" onPress={() => moveEvent(-1)} disabled={!study.events.length || current <= seconds(study.events[0].start)}/>
          <Control label="Next ▶" onPress={() => moveEvent(1)} disabled={!study.events.length || current >= seconds(study.events[study.events.length - 1].start)}/>
        </Group>
      </GlassPanel>

      <GlassPanel style={styles.chartPanel}>
        <View style={styles.chartHead}><Text style={styles.chartTitle}>{signal} ECG</Text><Text style={styles.rr}>R-R {rrInterval} ms</Text></View>
        <Pressable accessibilityRole="image" accessibilityLabel={`${signal} ECG waveform. Tap to seek within the current elapsed-time window.`} onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)} onPress={(event) => { const x = pressX(event); if (x !== null) seekPlot(x); }} style={[styles.chartTouch,{height:wide?Math.min(520,width*0.3):320}]}>
          <Svg width="100%" height="100%" viewBox="0 0 1000 520" preserveAspectRatio="none">
            <Rect x="0" y="0" width="1000" height="520" fill="#061417"/>
            {Array.from({ length: 19 }, (_, index) => <Line key={`h${index}`} x1={plot.left} x2={plot.right} y1={plot.top + index * 20} y2={plot.top + index * 20} stroke={index % 4 === 0 ? '#28434a' : '#152c31'} strokeWidth={index % 4 === 0 ? 1.2 : 0.7}/>)}
            {Array.from({ length: 13 }, (_, index) => <Line key={`v${index}`} x1={plot.left + index * (plot.right - plot.left) / 12} x2={plot.left + index * (plot.right - plot.left) / 12} y1={plot.top} y2={plot.bottom} stroke={index % 4 === 0 ? '#28434a' : '#152c31'} strokeWidth={index % 4 === 0 ? 1.2 : 0.7}/>)}
            {study.events.map((event) => { const a = seconds(event.start), b = seconds(event.end); if (b < start || a > end) return null; const x1 = plot.left + (Math.max(a,start)-start)/visibleSeconds*(plot.right-plot.left); const x2 = plot.left + (Math.min(b,end)-start)/visibleSeconds*(plot.right-plot.left); return <Rect key={event.id} x={x1} y={plot.top} width={Math.max(1,x2-x1)} height={plot.bottom-plot.top} fill={eventRed} fillOpacity={0.28}/>; })}
            <Path d={wavePath} fill="none" stroke={signal === 'Filtered' ? '#32E6A6' : '#71D9F2'} strokeWidth={2.4}/>
            {peaks.map((peak, index) => <Circle key={index} cx={peak.x} cy={peak.y} r={Math.abs(peak.time-current) < rrInterval / 2000 ? 5.5 : 4} fill={Math.abs(peak.time-current) < rrInterval / 2000 ? '#FFD166' : 'transparent'} stroke={Math.abs(peak.time-current) < rrInterval / 2000 ? '#FFD166' : '#54E7E8'} strokeWidth={1.8}/>)}
            <Line x1={plot.left+(current-start)/visibleSeconds*(plot.right-plot.left)} x2={plot.left+(current-start)/visibleSeconds*(plot.right-plot.left)} y1={plot.top} y2={plot.bottom} stroke="#CAF0F8" strokeWidth={1.2}/>
            {Array.from({ length: 5 }, (_, index) => { const t = start + index * visibleSeconds / 4; const x = plot.left + index * (plot.right-plot.left) / 4; return <SvgText key={index} x={x} y={plot.bottom+23} fill="#CAF0F8" fontSize="13" textAnchor="middle">{timeLabel(t)}</SvgText>; })}
            <SvgText x={30} y={235} fill="#CAF0F8" fontSize="13" transform="rotate(-90 30 235)" textAnchor="middle">ECG (mV)</SvgText>
          </Svg>
        </Pressable>
        <View style={styles.legend}><Legend color={eventRed} text="Apnea interval"/><Legend color="#54E7E8" text="R-peak" hollow/><Legend color="#FFD166" text="Selected peak"/></View>
      </GlassPanel>

      <GlassPanel style={styles.chartPanel}>
        <View style={styles.chartHead}><Text style={styles.chartTitle}>Full night</Text><Text style={styles.rr}>Tap to jump · {timeLabel(current)}</Text></View>
        <View onLayout={(event) => setTimelineWidth(event.nativeEvent.layout.width)} style={styles.timeline}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>{study.events.map((event) => <View key={event.id} style={[styles.nightEvent,{left:`${seconds(event.start)/durationSeconds*100}%`,width:`${Math.max(0.15,(seconds(event.end)-seconds(event.start))/durationSeconds*100)}%`}]}/>)}</View>
          <View pointerEvents="none" style={[styles.currentPosition,{left:`${current/durationSeconds*100}%`}]}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Seek across the full-night recording" onPress={(event) => { const x = pressX(event); if (x !== null) seekNight(x); }} style={StyleSheet.absoluteFill}/>
        </View>
        <View style={styles.nightAxis}><Text style={styles.axisText}>00:00:00</Text><Text style={styles.axisText}>{timeLabel(durationSeconds/3)}</Text><Text style={styles.axisText}>{timeLabel(durationSeconds*2/3)}</Text><Text style={styles.axisText}>{timeLabel(durationSeconds)}</Text></View>
      </GlassPanel>
    </> : <GlassPanel style={styles.empty}>
      <Text style={styles.emptyMark}>∿</Text>
      <Text style={styles.chartTitle}>Analysis is not connected yet</Text>
      <Text style={styles.emptyCopy}>The recording is stored securely. The ECG waveform, heart rate and apnea events will appear here once the analysis model is connected.</Text>
    </GlassPanel>}

    <View style={styles.footer}>
      <AppButton variant="quiet" onPress={() => router.push('/')} style={styles.footerButton}><Text style={styles.quietText}>Back to Home</Text></AppButton>
      <AppButton onPress={() => router.push('/summary')} style={styles.footerButton}><Text style={styles.buttonText}>View summary</Text></AppButton>
    </View>
  </ScrollView>;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'muted' }) {
  return <GlassPanel style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, tone === 'good' && styles.statGood, tone === 'muted' && styles.statMuted]}>{value}</Text><Text style={styles.statSub}>{sub}</Text></GlassPanel>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><View style={styles.groupRow}>{children}</View></View>;
}
function Legend({ color, text, hollow = false }: { color: string; text: string; hollow?: boolean }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { borderColor: color, backgroundColor: hollow ? 'transparent' : color }]}/><Text style={styles.legendText}>{text}</Text></View>;
}
function Control({ label, onPress, active = false, disabled = false, square = false }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean; square?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.control,square&&styles.controlSquare,active&&styles.controlActive,disabled&&styles.controlDisabled]}><Text style={[styles.controlText,active&&styles.controlTextActive]}>{label}</Text></Pressable>; }

const styles=StyleSheet.create({
  scroll:{flex:1},page:{width:'100%',maxWidth:1280,alignSelf:'center',paddingHorizontal:16,paddingTop:16,paddingBottom:106,gap:14},pageWide:{paddingHorizontal:24},
  stats:{flexDirection:'row',flexWrap:'wrap',gap:12},
  stat:{flex:1,minWidth:180,gap:4},statLabel:{color:colors.muted,fontSize:13,fontWeight:'700'},statValue:{color:colors.text,fontSize:24,lineHeight:30,fontWeight:'800'},statGood:{color:'#BDEEE5'},statMuted:{color:colors.muted},statSub:{color:colors.muted,fontSize:13},
  toolbar:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',justifyContent:'space-between',gap:16},
  group:{flexGrow:1,minWidth:200,gap:8},groupTitle:{color:colors.muted,fontSize:13,fontWeight:'700'},groupRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},
  zoom:{flexDirection:'row',alignItems:'center',gap:6},zoomValue:{color:colors.text,fontSize:14,fontWeight:'800',minWidth:28,textAlign:'center'},
  control:{minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:16,borderRadius:999,borderWidth:1,borderColor:colors.border,backgroundColor:colors.scrim},controlSquare:{width:44,paddingHorizontal:0},controlActive:{backgroundColor:colors.accent,borderColor:colors.accent},controlDisabled:{opacity:0.45},controlText:{color:colors.text,fontSize:14,fontWeight:'700'},controlTextActive:{color:colors.accentText},
  picker:{minHeight:44,minWidth:120,borderWidth:1,borderColor:colors.border,borderRadius:999,backgroundColor:colors.scrim,color:colors.text,fontSize:14,fontFamily:fonts.regular,paddingHorizontal:12},
  chartPanel:{gap:10},chartHead:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8},chartTitle:{color:colors.text,fontSize:16,fontWeight:'800'},rr:{color:colors.muted,fontSize:14},
  chartTouch:{width:'100%',overflow:'hidden',borderRadius:14,backgroundColor:'#061417'},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:16},legendItem:{flexDirection:'row',alignItems:'center',gap:6},legendDot:{width:12,height:12,borderRadius:6,borderWidth:2},legendText:{color:colors.text,fontSize:13},
  timeline:{position:'relative',height:64,overflow:'hidden',borderRadius:12,backgroundColor:'#07171A'},nightEvent:{position:'absolute',top:0,bottom:0,backgroundColor:eventRed},currentPosition:{position:'absolute',top:0,bottom:0,width:2,backgroundColor:colors.text,zIndex:1},nightAxis:{flexDirection:'row',justifyContent:'space-between'},axisText:{color:colors.muted,fontSize:13},
  copy:{color:colors.text,fontSize:14,lineHeight:21},
  empty:{minHeight:220,alignItems:'center',justifyContent:'center',gap:10,paddingVertical:28},emptyMark:{color:colors.accent,fontSize:36,fontWeight:'800'},emptyCopy:{color:colors.text,fontSize:14,lineHeight:21,textAlign:'center',maxWidth:520},
  footer:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-end',gap:10,paddingTop:4},footerButton:{minHeight:52,paddingHorizontal:22},buttonText:{color:colors.accentText,fontSize:16,fontWeight:'800'},quietText:{color:colors.text,fontSize:16,fontWeight:'700'},
  gate:{flex:1,justifyContent:'center',alignItems:'flex-start',padding:24,gap:16},title:{color:colors.text,fontSize:24,fontWeight:'800'},
});
