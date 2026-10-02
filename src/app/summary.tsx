import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';

const eventRed = '#D1495B';
const heartRates = [91,88,86,90,85,89,84,87,81,84,78,82,77,81,76,80,77,79];
const rrCounts = [1,4,12,27,48,72,88,91,78,57,37,22,13,7,3,1];
const hourWeights = [0.3,0.1,0.85,0.5,0.25,1.15,0.95,0.5,0.9];
const seconds = (value: string) => value.split(':').reduce((n, part) => n * 60 + Number(part), 0);

export default function SummaryScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { study, update } = useUploadState();
  const [tab, setTab] = useState<'Clinician report' | 'Patient explanation'>('Clinician report');
  const [message, setMessage] = useState('');
  const [plotWidth, setPlotWidth] = useState(1);
  const sample = study.metadata.includes('Sample record');
  const duration = study.duration ? seconds(study.duration) : 0;
  const labelledMinutes = sample && duration ? Math.floor(duration / 60) : null;
  const burden = Number(study.apneaBurden.replace('%','')) || 0;
  const hourly = sample ? hourWeights.map((v) => Math.min(100, burden * v / (hourWeights.reduce((a,b)=>a+b,0)/hourWeights.length))) : [];
  const metrics = study.summaryMetrics;
  const severityStyle = study.severity === 'Moderate' ? styles.moderate : study.severity === 'Mild / Normal' ? styles.mild : study.severity === 'Pending' ? styles.pending : styles.severe;
  const approved = () => { update({ reportStatus: 'Approved' }); setMessage('Approved in demo. PDF generation is not connected.'); };
  const primary = () => {
    if (study.reportStatus === 'Draft') { update({ reportStatus: 'Reviewed' }); setMessage('Report marked reviewed in this demo.'); }
    else if (study.reportStatus === 'Reviewed') approved();
    else setMessage('PDF export is not connected.');
  };
  const seek = (x: number) => router.push({ pathname: '/detail', params: { time: String(Math.round(x / plotWidth * duration)) } });

  if (study.status !== 'ready') return <View style={styles.gate}><Text style={styles.title}>No completed study summary</Text><Text style={styles.copy}>Upload a record and finish the preview first.</Text><AppButton href="/upload"><Text style={styles.buttonText}>Go to upload</Text></AppButton></View>;

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY SUMMARY" title="Clinical summary" description={`${study.studyId || 'Sample study'} · Report ${study.reportStatus.toLowerCase()} · elapsed HH:MM:SS.`} />
    <GlassPanel style={styles.hero}>
      <View style={[styles.severity,severityStyle]}><Text style={[styles.severityText,study.severity==='Pending'&&styles.pendingText]}>{study.severity==='Severe OSA'?'▲':study.severity==='Moderate'?'◆':study.severity==='Mild / Normal'?'✓':'○'} {study.severity || 'Severity unavailable'}</Text></View>
      <Text style={styles.big}>{study.apneaBurden || '—'}</Text>
      <Text style={styles.heroCopy}>{sample ? 'of the recorded night in apnea · illustrative preview' : 'Analysis output is not available for this local preview.'}</Text>
      <Text style={styles.copy}>{study.events.length} apnea events · {study.apneaMinutes || '—'} minutes flagged</Text>
    </GlassPanel>

    <View style={styles.metricGrid}>
      <Metric label="Recording" value={study.duration || '—'} />
      <Metric label="Labelled minutes" value={labelledMinutes === null ? '—' : String(labelledMinutes)} />
      <Metric label="Apnea minutes" value={study.apneaMinutes || '—'} />
      <Metric label="Apnea burden" value={study.apneaBurden || '—'} />
      <Metric label="Annotation runs" value={metrics ? String(metrics.annotationRuns) : '—'} />
      <Metric label="Median HR" value={metrics ? `${metrics.medianHrBpm} bpm` : '—'} />
      <Metric label="SDNN" value={metrics ? `${metrics.sdnnMs} ms` : '—'} />
      <Metric label="RMSSD / valid RR" value={metrics ? `${metrics.rmssdMs} ms · ${metrics.validRrPercent.toFixed(1)}%` : '—'} />
    </View>
    {!sample ? <GlassPanel style={styles.empty}><Text style={styles.copy}>Model analysis metrics and charts are unavailable. This preview reads file metadata only.</Text></GlassPanel> : null}

    <GlassPanel style={styles.signoff}><View style={styles.signoffHead}><Text style={styles.heading}>Report sign-off</Text><Text style={styles.status}>{study.reportStatus}</Text></View><View style={styles.stages}>{(['Draft','Reviewed','Approved'] as const).map((status,index)=><View key={status} style={styles.stage}><View style={[styles.stageDot,(study.reportStatus==='Reviewed'&&index<2||study.reportStatus==='Approved')&&styles.stageDone,index===0&&study.reportStatus==='Draft'&&styles.stageCurrent]} /><Text style={styles.copy}>{status}</Text></View>)}</View></GlassPanel>

    <View style={styles.tabs}>{(['Clinician report','Patient explanation'] as const).map((value)=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} onPress={()=>setTab(value)} style={[styles.tab,tab===value&&styles.tabActive]}><Text style={[styles.tabText,tab===value&&styles.tabTextActive]}>{value}</Text></Pressable>)}</View>
    <GlassPanel style={styles.report}><Text style={styles.heading}>{tab}</Text>{tab==='Clinician report'?<><Text style={styles.copy}>{sample?`Illustrative sample: ${study.events.length} apnea event intervals across ${study.duration || '—'} elapsed recording. This preview has no clinical interpretation.`:'Analysis output is not connected. No clinical interpretation is available.'}</Text><Text style={styles.copy}>Sampling rate: {study.sampleRate || '—'} Hz · Lead: {study.lead || '—'} · Time: elapsed HH:MM:SS</Text></>:<><Text style={styles.copy}>Patient explanation preview only. Have the clinical team review this language before sharing.</Text><Text style={styles.copy}>The recording may show breathing pauses during sleep. Discuss these results and possible next steps with your clinician.</Text></>}</GlassPanel>

    {sample ? <>
      <GlassPanel style={styles.chartPanel}>
        <Text style={styles.chartTitle}>Minute median heart rate · click to inspect ECG</Text>
        <Pressable accessibilityRole="image" accessibilityLabel="Illustrative median heart rate chart with apnea intervals. Click to inspect the ECG at that elapsed time." onLayout={(event)=>setPlotWidth(event.nativeEvent.layout.width)} onPress={(event)=>seek(event.nativeEvent.locationX)} style={styles.hrChart}>
          <Svg width="100%" height="100%" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <Rect x="0" y="0" width="1000" height="300" fill="transparent"/>
            {[60,80,100].map((v)=>{const y=260-(v-50)*3;return <Line key={v} x1="56" x2="990" y1={y} y2={y} stroke="#B4D3DA" strokeOpacity={0.3}/>;})}
            {study.events.map((event)=>{const x=56+seconds(event.start)/Math.max(duration,1)*930;const w=(seconds(event.end)-seconds(event.start))/Math.max(duration,1)*930;return <Rect key={event.id} x={x} y="24" width={Math.max(1,w)} height="236" fill={eventRed} fillOpacity="0.22"/>;})}
            <Path d={heartRates.map((v,i)=>`${i?'L':'M'}${56+i*930/(heartRates.length-1)} ${260-(v-50)*3}`).join(' ')} fill="none" stroke="#008B95" strokeWidth="3"/>
            {['00:00:00','02:00:00','04:00:00','06:00:00','08:00:00'].map((t,i)=><SvgText key={i} x={56+i*930/4} y="287" fill="#CAF0F8" fontSize="14" textAnchor="middle">{t}</SvgText>)}
            {[60,80,100].map((v)=><SvgText key={v} x="40" y={264-(v-50)*3} fill="#CAF0F8" fontSize="13" textAnchor="end">{v}</SvgText>)}
          </Svg>
        </Pressable>
        <Text style={styles.copy}>bpm · shaded regions mark apnea annotations · sample visualization</Text>
      </GlassPanel>
      <View style={[styles.chartRow,wide&&styles.chartRowWide]}>
        <GlassPanel style={styles.chartPanel}><Text style={styles.chartTitle}>Hourly apnea burden</Text><Svg width="100%" height="250" viewBox="0 0 600 250">
          {[0,25,50,75,100].map((v)=><Line key={v} x1="42" x2="590" y1={205-v*1.65} y2={205-v*1.65} stroke="#B4D3DA" strokeOpacity={0.24}/>)}
          {hourly.map((v,i)=><Fragment key={i}><Rect x={52+i*59} y={205-v*1.65} width="35" height={v*1.65} fill={eventRed} opacity={0.9}/><SvgText x={69+i*59} y="230" fill="#CAF0F8" fontSize="11" textAnchor="middle">{String(i).padStart(2,'0')}:00</SvgText></Fragment>)}
        </Svg><Text style={styles.copy}>Apnea labels by recording hour · sample visualization</Text></GlassPanel>
        <GlassPanel style={styles.chartPanel}><Text style={styles.chartTitle}>Plausible RR-interval distribution</Text><Svg width="100%" height="250" viewBox="0 0 600 250">
          {[0,30,60,90].map((v)=><Line key={v} x1="42" x2="590" y1={205-v*1.7} y2={205-v*1.7} stroke="#B4D3DA" strokeOpacity={0.24}/>)}
          {rrCounts.map((v,i)=><Rect key={i} x={48+i*33} y={205-v*1.7} width="31" height={v*1.7} fill="#1CB3B9" opacity={0.85}/>)}
          <Line x1="42" x2="590" y1="204" y2="204" stroke="#B4D3DA"/><Line x1="42" x2="42" y1="40" y2="205" stroke="#B4D3DA"/>
          <SvgText x="44" y="232" fill="#CAF0F8" fontSize="13">0.4 s</SvgText><SvgText x="555" y="232" fill="#CAF0F8" fontSize="13" textAnchor="end">1.8 s</SvgText>
          {metrics?<Line x1={42+(metrics.medianHrBpm?60/metrics.medianHrBpm-0.4:0.36)/1.4*548} x2={42+(60/metrics.medianHrBpm-0.4)/1.4*548} y1="40" y2="205" stroke={eventRed} strokeWidth="2.5"/>:null}
        </Svg><Text style={styles.copy}>{metrics?`Median RR ${(60/metrics.medianHrBpm).toFixed(2)} s · sample visualization`:'Sample RR distribution; summary metrics unavailable'}</Text></GlassPanel>
      </View>
    </> : null}

    <View style={styles.actions}><AppButton onPress={primary} style={styles.primaryButton}><Text style={styles.buttonText}>{study.reportStatus==='Draft'?'Mark report reviewed':study.reportStatus==='Reviewed'?'Approve & export PDF':'Export PDF'}</Text></AppButton><AppButton variant="quiet" onPress={()=>setMessage('Share preview is not connected.')}><Text style={styles.link}>Share</Text></AppButton><AppButton variant="quiet" onPress={()=>setMessage('Print preview is not connected.')}><Text style={styles.link}>Print</Text></AppButton></View>
    {message?<GlassPanel><Text accessibilityRole="alert" style={styles.copy}>{message}</Text></GlassPanel>:null}
  </ScrollView>;
}

function Metric({label,value}:{label:string;value:string}){return <GlassPanel style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></GlassPanel>;}
const styles=StyleSheet.create({scroll:{flex:1},page:{width:'100%',maxWidth:1440,alignSelf:'center',padding:20,paddingTop:18,paddingBottom:112,gap:16},gate:{flex:1,justifyContent:'center',alignItems:'flex-start',padding:24,gap:16},title:{color:colors.text,fontSize:24,fontWeight:'800'},hero:{gap:7},severity:{alignSelf:'flex-start',minHeight:40,justifyContent:'center',paddingHorizontal:14,borderRadius:999},severe:{backgroundColor:colors.coral},moderate:{backgroundColor:'#FFD166'},mild:{backgroundColor:colors.accent},pending:{backgroundColor:'transparent',borderWidth:1,borderStyle:'dashed',borderColor:colors.text},severityText:{color:colors.accentText,fontSize:14,fontWeight:'800'},pendingText:{color:colors.text},big:{color:colors.text,fontSize:54,lineHeight:60,fontWeight:'800'},heroCopy:{color:colors.text,fontSize:18,fontWeight:'700'},copy:{color:colors.text,fontSize:14,lineHeight:21},metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:'22%',minWidth:145,minHeight:88,justifyContent:'center',gap:4},metricLabel:{color:colors.text,fontSize:14},metricValue:{color:colors.text,fontSize:22,fontWeight:'800'},empty:{gap:8},signoff:{gap:12},signoffHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},heading:{color:colors.text,fontSize:16,fontWeight:'800'},status:{color:colors.accentText,fontSize:14,fontWeight:'800',backgroundColor:colors.accent,paddingHorizontal:12,paddingVertical:6,borderRadius:999},stages:{flexDirection:'row',flexWrap:'wrap',gap:22},stage:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8},stageDot:{width:14,height:14,borderRadius:7,borderWidth:2,borderColor:colors.muted},stageDone:{backgroundColor:colors.accent,borderColor:colors.accent},stageCurrent:{borderColor:colors.text},tabs:{flexDirection:'row',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},tab:{minHeight:48,justifyContent:'center',paddingHorizontal:10,borderBottomWidth:2,borderBottomColor:'transparent'},tabActive:{borderBottomColor:colors.accent},tabText:{color:colors.muted,fontSize:14},tabTextActive:{color:colors.text,fontWeight:'800'},report:{gap:9},chartPanel:{flex:1,minWidth:300,gap:10},chartTitle:{color:colors.text,fontSize:16,fontWeight:'800'},hrChart:{width:'100%',height:300},chartRow:{gap:12},chartRowWide:{flexDirection:'row',alignItems:'stretch'},actions:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},primaryButton:{minHeight:54},buttonText:{color:colors.accentText,fontSize:16,fontWeight:'800'},link:{color:colors.text,fontSize:14,fontWeight:'700',textDecorationLine:'underline'}});
