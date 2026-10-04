import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Picker } from '@expo/ui/community/picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppButton, FormLabel, GlassPanel, PageIntro, PosaText as Text } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { formatDeidentifiedStudyId, parseRecordHeader } from '@/components/record-metadata';
import { colors, fonts } from '@/components/posa-theme';
import { findOrCreatePatient, uploadEcgStudy } from '@/lib/queries';
import { startStudyAnalysis } from '@/lib/inference';

const sexes = ['Female', 'Male', 'Other', 'Unknown'];
// Browsers don't know a MIME type for .hea/.dat, so on web filter by extension instead.
const pickerTypes = Platform.OS === 'web'
  ? ['.hea', '.dat']
  : ['application/octet-stream'];
// expo-file-system is not supported on web; there the picker gives us a browser File.
async function readHead(asset: DocumentPicker.DocumentPickerAsset) {
  const size = 128 * 1024;
  const buffer = asset.file ? await asset.file.slice(0, size).arrayBuffer() : await new File(asset.uri).slice(0, size).arrayBuffer();
  return new Uint8Array(buffer);
}
const sexToDb: Record<string, string> = { Female: 'female', Male: 'male', Other: 'other', Unknown: 'unspecified' };

export default function UploadScreen() {
  const { study, update, start } = useUploadState();
  const [rawId, setRawId] = useState(study.studyId.replace(/^REC-/, '').replace('-', ''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const id = formatDeidentifiedStudyId(rawId);

  const pick = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: pickerTypes, multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const files = result.assets;
      const headers = files.filter((file) => /\.hea$/i.test(file.name));
      if (headers.length !== 1 || files.length !== 2) throw new Error('Select exactly one WFDB .hea header and its matching .dat signal file.');
      const header = headers[0];
      const dat = files.find((file) => /\.dat$/i.test(file.name));
      if (!dat || dat.name.replace(/\.dat$/i, '').toLowerCase() !== header.name.replace(/\.hea$/i, '').toLowerCase()) throw new Error('The .hea header and .dat signal file must have the same record name.');
      const detected = parseRecordHeader(header.name, await readHead(header));
      if (detected.format !== 'wfdb' || detected.sampleRate !== 100) throw new Error('This model accepts WFDB ECG recordings sampled at exactly 100 Hz.');
      setPicked(files);
      update({ fileName: files.map((file) => file.name).join(' + '), fileSize: files.reduce((total, file) => total + (file.size || 0), 0), format: 'wfdb', sampleRate: 100, lead: detected.lead, reportStatus: 'Draft', progress: 0, metadata: 'WFDB header validated', status: 'uploaded', uploadId: null, patientId: null, runId: null, errorMessage: '' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the selected file. Try another file.'); }
    finally { setLoading(false); }
  };
  const selectId = (value: string) => {
    setRawId(value);
    const formatted = formatDeidentifiedStudyId(value);
    update({ studyId: formatted.value });
  };
  const ready = Boolean(study.fileName && id.valid && study.format === 'wfdb' && study.sampleRate === 100);
  const begin = async () => {
    const ageNumber = Number(study.age);
    const ageGiven = study.age.trim() !== '';
    if (ageGiven && !(Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 130)) {
      setError('Age must be in years (0–130), not a birth year.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const bmiNumber = Number(study.bmi);
      const patient = await findOrCreatePatient({
        subjectCode: id.value,
        sex: sexToDb[study.sex],
        bmi: study.bmi.trim() && Number.isFinite(bmiNumber) ? bmiNumber : undefined,
      });
      // The signal/header file goes first: storage_path points at the first file.
      const ordered = [...picked].sort((a, b) => Number(/\.dat$/i.test(a.name)) - Number(/\.dat$/i.test(b.name)));
      const uploaded = await uploadEcgStudy({
        patientId: patient.patientId,
        recordCode: id.value,
        files: ordered.map((file) => ({ uri: file.uri, name: file.name, mimeType: file.mimeType })),
        ageYears: ageGiven ? ageNumber : undefined,
        leadConfiguration: study.lead,
        samplingRateHz: 100,
      });
      update({ studyId: id.value, sampleRate: 100, uploadId: uploaded.id, patientId: patient.patientId, status: 'queued', progress: 0 });
      start();
      try {
        const run = await startStudyAnalysis(uploaded.id);
        update({ status: run.status === 'completed' ? 'ready' : 'processing', runId: run.runId });
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Inference server is unavailable.';
        update({ status: 'failed', errorMessage: message });
      }
      router.push('/processing');
    } catch (reason) {
      // Supabase errors are plain objects with a message, not Error instances.
      const message = typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : '';
      setError(message || 'Upload failed. Check your connection and try again.');
    }
    finally { setSaving(false); }
  };

  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <PageIntro eyebrow="NEW STUDY" title="Upload a study" description="Choose a local ECG record. Use a de-identified subject ID; do not enter a patient name." />
    <GlassPanel style={styles.section}><Text style={styles.heading}>Study file <Text style={styles.required}>Required</Text></Text><Text style={styles.copy}>Supported: one WFDB .hea header and its matching .dat file, sampled at 100 Hz.</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={pick} style={styles.drop}><Text style={styles.dropTitle}>{loading ? 'Reading file header…' : study.fileName ? 'Change selected files' : 'Choose study file'}</Text><Text style={styles.copy}>Headers are read on this device; files are uploaded to private storage when you start.</Text></Pressable>
      {study.fileName ? <View style={styles.file}><View style={{ flex: 1 }}><Text style={styles.value}>{study.fileName}</Text><Text style={styles.copy}>{study.fileSize ? `${(study.fileSize / 1024 / 1024).toFixed(1)} MB` : ''} · {study.metadata}</Text></View><Pressable accessibilityRole="button" onPress={() => { update({ fileName: null, fileSize: 0, format: null, sampleRate: null, lead: '', metadata: '', studyId: '', durationSeconds: 0, progress: 0, status: 'empty', uploadId: null, patientId: null, runId: null, errorMessage: '' }); setPicked([]); }} style={styles.touch}><Text style={styles.link}>Remove</Text></Pressable></View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </GlassPanel>
    <GlassPanel style={styles.section}><FormLabel>De-identified study ID · required</FormLabel><TextInput value={rawId} onChangeText={selectId} placeholder="e.g. 8842WS" placeholderTextColor={colors.muted} autoCapitalize="characters" style={styles.input} accessibilityLabel="Enter four digits and a two-letter suffix"/><Text style={[styles.copy, !id.valid && styles.idHint]}>{id.preview}{!id.valid ? ' · enter 4 digits and 2 letters to continue' : ' · ready'}</Text>{rawId && !id.preview.startsWith('REC-') ? <Text accessibilityRole="alert" style={styles.error}>Use a four-digit number followed by two letters.</Text> : null}</GlassPanel>
    <GlassPanel style={styles.section}><Text style={styles.heading}>Patient context · optional</Text><View style={styles.fields}><Field label="Age" value={study.age} onChange={(age) => update({ age })} placeholder="Years"/><View style={styles.field}><FormLabel>Sex</FormLabel><Picker selectedValue={study.sex} onValueChange={(value) => update({ sex: String(value ?? '') })} style={styles.picker}><Picker.Item label="Select sex" value=""/>{sexes.map((value) => <Picker.Item key={value} label={value} value={value}/>)}</Picker></View><Field label="BMI" value={study.bmi} onChange={(bmi) => update({ bmi })} placeholder="kg/m²" numeric/></View></GlassPanel>
    <GlassPanel style={styles.section}><Text style={styles.heading}>Model input</Text><Text style={styles.copy}>{study.sampleRate ? `Detected: ${study.sampleRate} Hz · first ECG channel: ${study.lead || 'not named'}. The model processes complete one-minute windows.` : 'Sampling rate and first channel are validated from the WFDB header.'}</Text></GlassPanel>
    <View style={styles.footer}><AppButton onPress={begin} disabled={!ready || loading || saving} style={styles.cta}><Text style={styles.primaryText}>{saving ? 'Uploading…' : 'Upload and analyze'}</Text></AppButton>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<Text style={styles.copy}>{ready ? 'The recording is uploaded to private storage and sent to the inference server.' : 'Choose a matching WFDB pair, complete the study ID, and provide a 100 Hz ECG.'}</Text></View>
  </ScrollView>;
}

function Field({ label, value, onChange, placeholder, numeric }: {label:string;value:string;onChange:(v:string)=>void;placeholder:string;numeric?:boolean}) { return <View style={styles.field}><FormLabel>{label}</FormLabel><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric?'numeric':'default'} style={styles.input}/></View>; }
const styles=StyleSheet.create({scroll:{flex:1},page:{width:'100%',maxWidth:940,alignSelf:'center',paddingHorizontal:20,paddingTop:20,paddingBottom:56,gap:16},section:{gap:10},heading:{color:colors.text,fontSize:18,fontWeight:'700'},required:{color:colors.text,fontSize:14,fontWeight:'700'},copy:{color:colors.text,fontSize:14,lineHeight:21},idHint:{color:colors.muted},drop:{minHeight:120,justifyContent:'center',alignItems:'center',gap:7,backgroundColor:colors.scrim,borderWidth:1,borderColor:colors.border,borderRadius:20,padding:20},dropTitle:{color:colors.text,fontSize:16,fontWeight:'700'},file:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},value:{color:colors.text,fontSize:14,fontWeight:'700'},touch:{minHeight:44,justifyContent:'center',paddingHorizontal:10},link:{color:colors.text,fontSize:14,fontWeight:'700',textDecorationLine:'underline'},error:{color:colors.accentText,fontSize:14,lineHeight:21,backgroundColor:colors.coral,padding:8,borderRadius:8,overflow:'hidden'},input:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.scrim,paddingHorizontal:12,color:colors.text,fontSize:14,fontFamily:fonts.regular},fields:{flexDirection:'row',flexWrap:'wrap',gap:12},field:{flex:1,minWidth:145,gap:5},picker:{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.scrim,color:colors.text,fontSize:14,fontFamily:fonts.regular,paddingHorizontal:10},footer:{gap:10,alignItems:'flex-start',paddingTop:4},cta:{alignSelf:'stretch',minHeight:56},primaryText:{color:colors.accentText,fontSize:16,fontWeight:'800'}});
