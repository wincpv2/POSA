import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';

const tasks = ['Validate recording', 'Baseline correction', 'R-peak detection', 'HR / RR feature extraction', 'Apnea candidate classification', 'Temporal alignment and summary'];
export default function ProcessingScreen() {
  const { study, cancel, start } = useUploadState();
  useEffect(() => { if (study.status === 'empty' || study.status === 'uploaded') router.replace('/upload'); }, [study.status]);
  const done = study.status === 'ready';
  const sample = study.metadata.includes('Sample record');
  const metrics = study.summaryMetrics;
  const currentHr = 95;
  const rr = 640;
  const stage = Math.min(tasks.length - 1, Math.floor(study.progress / (100 / tasks.length)));
  const labels = [
    `${study.fileSize ? `${(study.fileSize / 1024 / 1024).toFixed(1)} MB` : 'File selected'} · ${study.sampleRate || '—'} Hz · ${study.lead || 'Lead unavailable'}`,
    'Signal baseline status · demo',
    sample && metrics ? `${metrics.rPeakCount.toLocaleString()} sample R-peaks` : 'No model count connected',
    sample && metrics ? `Median ${metrics.medianHrBpm} bpm · sample RR 640 ms` : 'HR / RR outputs unavailable',
    `${study.events.length} sample apnea candidates${study.apneaBurden ? ` · ${study.apneaBurden} burden` : ''}`,
    `${study.duration || 'Elapsed HH:MM:SS'} · summary alignment`,
  ];
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="STUDY WORKFLOW" title={done ? 'Preview is ready' : study.status === 'failed' ? 'Preview could not finish' : 'Preparing the preview'} description="The progress and model telemetry below are illustrative. No clinical model is connected." />
    <GlassPanel style={styles.section}><Text style={styles.heading}>{study.studyId || 'Study'} · {study.fileName || 'No file'}</Text><Text style={styles.copy}>Sampling rate: {study.sampleRate || '—'} Hz · Lead: {study.lead || '—'} · Time: elapsed HH:MM:SS</Text>{study.status === 'failed' ? <View style={styles.failure}><Text style={styles.failureText}>! Preview failed</Text></View> : null}<Text style={styles.copy}>{done ? 'Preview finished' : study.status === 'failed' ? 'Check the selected record, then retry the preview.' : `About ${Math.max(1, Math.ceil((100-study.progress)/17)*2)} seconds remaining`}</Text><View style={styles.track}><View style={[styles.fill,{width:`${study.progress}%`}]}/></View><Text style={styles.copy}>{study.progress}% complete</Text></GlassPanel>
    <GlassPanel style={styles.section}><View style={styles.headingRow}><Text style={styles.heading}>Prediction workflow</Text><Text style={styles.demoTag}>DEMO</Text></View>{tasks.map((task,index)=>{const complete=done || study.progress>=((index+1)*100/tasks.length);const active=study.status==='processing' && !complete && index===stage;return <View key={task} style={styles.task}><Text style={[styles.mark,complete&&styles.markDone,active&&styles.markActive]}>{complete?'✓':active?'●':'○'}</Text><View style={styles.taskCopy}><Text style={styles.copy}>{task}</Text><Text style={styles.taskMetric}>{labels[index]} · {complete?'Complete':active?'In progress':'Waiting'}</Text></View></View>;})}</GlassPanel>
    {sample ? <GlassPanel style={styles.section}><View style={styles.headingRow}><Text style={styles.heading}>Model telemetry</Text><Text style={styles.demoTag}>Illustrative sample</Text></View><View style={styles.metrics}><Metric value={`${currentHr} bpm`} label="Current HR"/><Metric value={`${rr} ms`} label="Previous / next R-R"/><Metric value={metrics ? metrics.rPeakCount.toLocaleString() : '—'} label="R-peaks detected"/><Metric value={String(study.events.length)} label="Apnea candidates"/></View><Text style={styles.classification}>NORMAL · N</Text></GlassPanel> : <GlassPanel style={styles.section}><Text style={styles.heading}>Model telemetry unavailable</Text><Text style={styles.copy}>This local preview has file metadata only. Prediction metrics appear when a model is connected.</Text></GlassPanel>}
    <View style={styles.actions}>{done ? <AppButton onPress={()=>router.push('/detail')}><Text style={styles.primary}>Open ECG</Text></AppButton> : study.status==='failed' ? <><AppButton onPress={start}><Text style={styles.primary}>Retry preview</Text></AppButton><Pressable accessibilityRole="link" onPress={()=>router.replace('/upload')} style={styles.touch}><Text style={styles.link}>Choose another file</Text></Pressable></> : <><AppButton onPress={()=>{cancel();router.replace('/upload');}} variant="quiet"><Text style={styles.link}>Cancel preview</Text></AppButton><Pressable accessibilityRole="link" onPress={()=>router.replace('/')} style={styles.touch}><Text style={styles.link}>Leave this page; progress continues</Text></Pressable></>}</View>
  </ScrollView>;
}

function Metric({ value, label }: { value: string; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.copy}>{label}</Text></View>; }
const styles=StyleSheet.create({scroll:{flex:1},page:{width:'100%',maxWidth:900,alignSelf:'center',padding:20,paddingTop:24,paddingBottom:56,gap:18},section:{gap:12},headingRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},heading:{color:colors.text,fontSize:18,fontWeight:'800'},copy:{color:colors.text,fontSize:14,lineHeight:21},failure:{alignSelf:'flex-start',backgroundColor:colors.coral,borderRadius:999,paddingHorizontal:12,paddingVertical:6},failureText:{color:colors.accentText,fontSize:14,fontWeight:'800'},demoTag:{color:colors.accentText,fontSize:14,fontWeight:'800',backgroundColor:colors.accent,paddingHorizontal:10,paddingVertical:5,borderRadius:999},track:{height:10,borderRadius:99,backgroundColor:'rgba(255,255,255,0.14)',overflow:'hidden'},fill:{height:'100%',backgroundColor:colors.accent},task:{minHeight:58,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},mark:{width:24,color:colors.muted,fontSize:17},markDone:{color:colors.accent},markActive:{color:colors.accent},taskCopy:{flex:1,gap:2},taskMetric:{color:colors.muted,fontSize:14},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flex:1,minWidth:135,minHeight:74,justifyContent:'center',gap:3,padding:12,borderRadius:16,backgroundColor:'rgba(2,3,58,0.4)'},metricValue:{color:colors.text,fontSize:20,fontWeight:'800'},classification:{alignSelf:'flex-start',color:colors.accentText,fontSize:14,fontWeight:'800',backgroundColor:colors.accent,paddingHorizontal:14,paddingVertical:8,borderRadius:999},actions:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},primary:{color:colors.accentText,fontSize:16,fontWeight:'800'},link:{color:colors.text,fontSize:14,fontWeight:'700',textDecorationLine:'underline'},touch:{minHeight:44,justifyContent:'center',paddingHorizontal:8}});
