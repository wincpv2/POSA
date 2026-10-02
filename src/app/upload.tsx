import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Picker from '@expo/ui/community/picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppButton, FormLabel, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { sampleEvents, useUploadState } from '@/components/posa-state';
import { formatDeidentifiedStudyId, parseRecordHeader } from '@/components/record-metadata';
import { colors, fonts } from '@/components/posa-theme';

const rates = [100, 125, 200, 250, 300, 500, 1000];
const leads = ['Lead I', 'Lead II', 'Lead III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'MLII'];
const sexes = ['Female', 'Male', 'Other', 'Unknown'];

export default function UploadScreen() {
  const { study, update, start } = useUploadState();
  const [rawId, setRawId] = useState(study.studyId.replace(/^REC-/, '').replace('-', ''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rate, setRate] = useState(study.sampleRate ? String(study.sampleRate) : '');
  const [lead, setLead] = useState(study.lead);
  const id = formatDeidentifiedStudyId(rawId);
  const rateOptions = [...new Set([...(study.sampleRate ? [study.sampleRate] : []), ...rates])].sort((a, b) => a - b);
  const leadOptions = [...new Set([...(study.lead ? [study.lead] : []), ...leads])];

  useEffect(() => {
    if (study.status === 'empty') { setRawId(''); setRate(''); setLead(''); }
  }, [study.status]);

  const pick = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/edf', 'application/octet-stream', 'image/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const files = result.assets;
      const header = files.find((file) => /\.(edf|hea)$/i.test(file.name));
      const image = files.find((file) => /\.(png|jpe?g|tiff?)$/i.test(file.name));
      if (!header && !image) throw new Error('Unsupported format. Select an EDF, WFDB .hea/.dat pair, PNG, JPEG or TIFF. DICOM is not supported.');
      let format: 'edf' | 'wfdb' | 'image' = 'image';
      let sampleRate: number | null = null;
      let detectedLead = '';
      if (header) {
        const isHea = /\.hea$/i.test(header.name);
        if (isHea && !files.some((file) => file.name.toLowerCase() === `${header.name.replace(/\.hea$/i, '').toLowerCase()}.dat`)) throw new Error('Select the matching WFDB .dat signal file with the .hea header.');
        const detected = parseRecordHeader(header.name, new Uint8Array(await new File(header.uri).slice(0, 128 * 1024).arrayBuffer()));
        format = detected.format;
        sampleRate = detected.sampleRate;
        detectedLead = detected.lead;
      }
      setRawId('');
      setRate(sampleRate ? String(sampleRate) : '');
      setLead(detectedLead);
      update({ fileName: files.map((file) => file.name).join(' + '), fileSize: files.reduce((total, file) => total + (file.size || 0), 0), format, sampleRate, lead: detectedLead, studyId: '', age: '', sex: '', bmi: '', severity: '', apneaBurden: '', apneaMinutes: '', noEventMinutes: '', duration: '', events: [], summaryMetrics: null, reportStatus: 'Draft', progress: 0, metadata: header ? 'Header detected locally' : 'Image · select signal settings manually', status: 'uploaded' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the selected file. Try another file.'); }
    finally { setLoading(false); }
  };
  const selectId = (value: string) => {
    setRawId(value);
    const formatted = formatDeidentifiedStudyId(value);
    update({ studyId: formatted.value });
  };
  const selectRate = (value: string | number | null) => setRate(String(value ?? ''));
  const selectLead = (value: string | number | null) => setLead(String(value ?? ''));
  const ready = Boolean(study.fileName && id.valid && Number(rate) > 0 && lead && (study.format === 'image' || study.sampleRate));
  const begin = () => { update({ studyId: id.value, sampleRate: Number(rate) || null, lead, events: study.metadata.includes('Sample record') ? sampleEvents : [], summaryMetrics: study.metadata.includes('Sample record') ? study.summaryMetrics : null }); start(); router.push('/processing'); };

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="NEW STUDY" title="Upload a study" description="Choose a local ECG record. Use a de-identified subject ID; do not enter a patient name." />
    <GlassPanel style={styles.section}><Text style={styles.heading}>Study file <Text style={styles.required}>Required</Text></Text><Text style={styles.copy}>Supported: EDF, WFDB (.hea + .dat), PNG, JPEG, TIFF. DICOM is not supported.</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={pick} style={styles.drop}><Text style={styles.dropTitle}>{loading ? 'Reading file header…' : study.fileName ? 'Change selected files' : 'Choose study file'}</Text><Text style={styles.copy}>Files are read locally on this device.</Text></Pressable>
      {study.fileName ? <View style={styles.file}><View style={{ flex: 1 }}><Text style={styles.value}>{study.fileName}</Text><Text style={styles.copy}>{study.fileSize ? `${(study.fileSize / 1024 / 1024).toFixed(1)} MB` : ''} · {study.metadata}</Text></View><Pressable accessibilityRole="button" onPress={() => { update({ fileName: null, fileSize: 0, format: null, sampleRate: null, lead: '', metadata: '', studyId: '', age: '', sex: '', bmi: '', severity: '', apneaBurden: '', apneaMinutes: '', noEventMinutes: '', duration: '', events: [], summaryMetrics: null, progress: 0, status: 'empty' }); setRawId(''); setRate(''); setLead(''); }} style={styles.touch}><Text style={styles.link}>Remove</Text></Pressable></View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </GlassPanel>
    <GlassPanel style={styles.section}><FormLabel>De-identified study ID · required</FormLabel><TextInput value={rawId} onChangeText={selectId} placeholder="e.g. 8842WS" placeholderTextColor={colors.muted} autoCapitalize="characters" style={styles.input} accessibilityLabel="Enter four digits and a two-letter suffix"/><Text style={[styles.copy, !id.valid && styles.idHint]}>{id.preview}{!id.valid ? ' · enter 4 digits and 2 letters to continue' : ' · ready'}</Text>{rawId && !id.preview.startsWith('REC-') ? <Text accessibilityRole="alert" style={styles.error}>Use a four-digit number followed by two letters.</Text> : null}</GlassPanel>
    <GlassPanel style={styles.section}><Text style={styles.heading}>Patient context · optional</Text><View style={styles.fields}><Field label="Age" value={study.age} onChange={(age) => update({ age })} placeholder="Years"/><View style={styles.field}><FormLabel>Sex</FormLabel><Picker selectedValue={study.sex} onValueChange={(value) => update({ sex: String(value ?? '') })} style={styles.picker}><Picker.Item label="Select sex" value=""/>{sexes.map((value) => <Picker.Item key={value} label={value} value={value}/>)}</Picker></View><Field label="BMI" value={study.bmi} onChange={(bmi) => update({ bmi })} placeholder="kg/m²" numeric/></View></GlassPanel>
    <GlassPanel style={styles.section}><Text style={styles.heading}>Signal settings</Text><Text style={styles.copy}>{study.sampleRate ? `Detected from header: ${study.sampleRate} Hz · ${study.lead || 'ECG'} · choose another value only if verified.` : 'Images have no readable signal header. Select signal settings manually.'}</Text><View style={styles.fields}><View style={styles.field}><FormLabel>Sampling rate (Hz) · required</FormLabel><Picker selectedValue={rate} onValueChange={selectRate} style={styles.picker}><Picker.Item label="Choose sampling rate" value=""/>{rateOptions.map((value) => <Picker.Item key={value} label={`${value} Hz${value === study.sampleRate ? ' · detected' : ''}`} value={String(value)}/>)}</Picker></View><View style={styles.field}><FormLabel>Lead · required</FormLabel><Picker selectedValue={lead} onValueChange={selectLead} style={styles.picker}><Picker.Item label="Choose lead" value=""/>{leadOptions.map((value) => <Picker.Item key={value} label={`${value}${value === study.lead ? ' · detected' : ''}`} value={value}/>)}</Picker></View></View></GlassPanel>
    <View style={styles.footer}><AppButton onPress={begin} disabled={!ready || loading} style={styles.cta}><Text style={styles.primaryText}>Start analysis</Text></AppButton><Text style={styles.copy}>{ready ? 'Demo workflow only · no clinical analysis will run.' : 'Choose a valid file, complete the study ID, and select signal settings.'}</Text></View>
  </ScrollView>;
}

function Field({ label, value, onChange, placeholder, numeric }: {label:string;value:string;onChange:(v:string)=>void;placeholder:string;numeric?:boolean}) { return <View style={styles.field}><FormLabel>{label}</FormLabel><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric?'numeric':'default'} style={styles.input}/></View>; }
const styles=StyleSheet.create({scroll:{flex:1},page:{width:'100%',maxWidth:940,alignSelf:'center',paddingHorizontal:20,paddingTop:20,paddingBottom:56,gap:16},section:{gap:10},heading:{color:colors.text,fontSize:18,fontWeight:'700'},required:{color:colors.text,fontSize:14,fontWeight:'700'},copy:{color:colors.text,fontSize:14,lineHeight:21},idHint:{color:colors.muted},drop:{minHeight:120,justifyContent:'center',alignItems:'center',gap:7,backgroundColor:colors.scrim,borderWidth:1,borderColor:colors.border,borderRadius:20,padding:20},dropTitle:{color:colors.text,fontSize:16,fontWeight:'700'},file:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},value:{color:colors.text,fontSize:14,fontWeight:'700'},touch:{minHeight:44,justifyContent:'center',paddingHorizontal:10},link:{color:colors.text,fontSize:14,fontWeight:'700',textDecorationLine:'underline'},error:{color:colors.accentText,fontSize:14,lineHeight:21,backgroundColor:colors.coral,padding:8,borderRadius:8,overflow:'hidden'},input:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.scrim,paddingHorizontal:12,color:colors.text,fontSize:14,fontFamily:fonts.regular},fields:{flexDirection:'row',flexWrap:'wrap',gap:12},field:{flex:1,minWidth:145,gap:5},picker:{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.scrim,color:colors.text,fontSize:14,fontFamily:fonts.regular,paddingHorizontal:10},footer:{gap:10,alignItems:'flex-start',paddingTop:4},cta:{alignSelf:'stretch',minHeight:56},primaryText:{color:colors.accentText,fontSize:16,fontWeight:'800'}});
