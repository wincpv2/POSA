import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { AppButton, FormLabel, PageIntro, Pill, SectionTitle, Surface } from '@/components/posa-ui';
import { useUploadState } from '@/components/posa-state';
import { colors } from '@/components/posa-theme';

const rates = ['100 Hz', '250 Hz', '500 Hz'];
const durations = ['Full Night', '4 Hours', '1 h Chunk'];

export default function UploadScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 940;
  const { fileName, setFileName } = useUploadState();
  const [lead, setLead] = useState('Lead II');
  const [rate, setRate] = useState('100 Hz');
  const [duration, setDuration] = useState('Full Night');
  const [sex, setSex] = useState('Male');
  const [pickerError, setPickerError] = useState<string | null>(null);

  const browse = async () => {
    setPickerError(null);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.dat,.hea,.edf,.png,.jpg,.jpeg,.tif,.tiff';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) setFileName(file.name);
      };
      input.click();
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        setFileName(result.assets[0].fileName ?? 'selected-ecg-image');
      }
    } catch {
      setPickerError('The image library could not be opened. Please try again.');
    }
  };

  const loadSample = () => setFileName('sample-x07.edf');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <PageIntro
        eyebrow="NEW STUDY · DATA INGESTION"
        title="Upload a sleep study"
        description="Choose a local record and set the display options for this prototype workspace. Files stay on this device; no analysis service is connected."
        badge="Awaiting telemetry"
      />

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={styles.primaryColumn}>
          <Surface style={styles.uploadPanel}>
            <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>↑</Text></View>
            <Text style={styles.uploadTitle}>Upload polysomnography trace</Text>
            <Text style={styles.uploadCopy}>Select a PhysioNet record or high-resolution paper strip scan.</Text>
            <View style={styles.formatList}>
              {['EDF+', 'WFDB 16-BIT', 'DICOM-ECG', 'PNG / TIFF'].map((format) => <Text key={format} style={styles.formatChip}>{format}</Text>)}
            </View>
            {fileName ? (
              <View style={styles.selectedFile}>
                <View style={styles.fileGlyph}><Text style={styles.fileGlyphText}>FILE</Text></View>
                <View style={styles.selectedFileCopy}>
                  <Text style={styles.selectedFileName} numberOfLines={1}>{fileName}</Text>
                  <Text style={styles.selectedFileStatus}>Selected locally · ready for the interface preview</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setFileName(null)} style={styles.removeFile}><Text style={styles.removeFileText}>Remove</Text></Pressable>
              </View>
            ) : null}
            {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
            <View style={styles.uploadActions}>
              <AppButton onPress={browse} variant="secondary" style={styles.browseButton}>
                <Text style={styles.secondaryButtonText}>▧  Browse files</Text>
              </AppButton>
              <AppButton onPress={loadSample} variant="quiet" style={styles.sampleButton}>
                <Text style={styles.quietButtonText}>Load sample record</Text>
              </AppButton>
            </View>
            <Text style={styles.localNote}>JPG · PNG · HEIC on mobile  /  .dat · .hea · .edf · image on web</Text>
          </Surface>

          <View style={styles.runActions}>
            <AppButton
              disabled={!fileName}
              onPress={() => router.push('/processing')}
              style={styles.runButton}>
              <Text style={styles.primaryButtonText}>◉  Preview analysis workflow  →</Text>
            </AppButton>
            <Text style={styles.runNote}>{fileName ? 'Prototype navigation only. No file is transmitted or analyzed.' : 'Select a local file or load the sample record to continue.'}</Text>
          </View>

          <Surface style={styles.optionsPanel}>
            <SectionTitle title="Signal calibration" subtitle="Set the defaults shown in the analysis workspace" right={<Pill label="AUTO-CALIBRATED" />} />
            <FormLabel>LEAD CONFIGURATION</FormLabel>
            <View style={styles.segmentRow}>
              {['Lead II', 'Modified V1'].map((option) => <Option key={option} label={option} active={lead === option} onPress={() => setLead(option)} />)}
            </View>
            <View style={[styles.optionColumns, wide && styles.optionColumnsWide]}>
              <View style={styles.optionGroup}>
                <FormLabel>SAMPLING RATE</FormLabel>
                <View style={styles.segmentRow}>
                  {rates.map((option) => <Option key={option} label={option} active={rate === option} onPress={() => setRate(option)} compact />)}
                </View>
              </View>
              <View style={styles.optionGroup}>
                <FormLabel>DURATION WINDOW</FormLabel>
                <View style={styles.segmentRow}>
                  {durations.map((option) => <Option key={option} label={option} active={duration === option} onPress={() => setDuration(option)} compact />)}
                </View>
              </View>
            </View>
          </Surface>

          <Surface style={styles.metadataPanel}>
            <SectionTitle title="Cohort metadata" subtitle="Optional study labels for the upcoming integration" right={<Pill label="OPTIONAL" tone="blue" />} />
            <View style={[styles.metadataGrid, wide && styles.metadataGridWide]}>
              <Field label="Subject ID" value="PT-2024-X07" placeholder="e.g. PT-001" />
              <Field label="Age (years)" value="54" placeholder="Age" keyboardType="numeric" />
              <View style={styles.metaField}>
                <FormLabel>Biological sex</FormLabel>
                <View style={styles.segmentRow}>
                  {['Male', 'Female'].map((option) => <Option key={option} label={option} active={sex === option} onPress={() => setSex(option)} compact />)}
                </View>
              </View>
              <Field label="Body mass index" value="29.8 kg/m²" placeholder="Optional" />
            </View>
          </Surface>

        </View>

        <View style={styles.sideColumn}>
          <Surface style={styles.qualityPanel}>
            <SectionTitle title="Signal quality" subtitle="A preview panel for connected record data" right={<Pill label={fileName ? 'PENDING' : 'NO DATA'} tone="neutral" />} />
            <View style={styles.emptySignal}>
              <View style={styles.emptySignalGrid} />
              <Text style={styles.emptySignalMark}>∿</Text>
              <Text style={styles.emptySignalTitle}>{fileName ? 'Signal preview will appear here' : 'No ECG image loaded'}</Text>
              <Text style={styles.emptySignalCopy}>The viewer is intentionally empty in this front-end prototype.</Text>
            </View>
            <View style={styles.pendingRows}>
              <Pending label="Signal quality index" value="Waiting for data" />
              <Pending label="Lead configuration" value={lead} />
              <Pending label="Sampling rate" value={rate} />
            </View>
          </Surface>

          <Surface style={styles.privacyPanel}>
            <View style={styles.privacyIcon}><Text style={styles.privacyIconText}>i</Text></View>
            <View style={styles.privacyCopy}>
              <Text style={styles.privacyTitle}>Front-end prototype</Text>
              <Text style={styles.privacyText}>The selected filename is kept in local interface state. No upload request or model call is made.</Text>
            </View>
          </Surface>
        </View>
      </View>
    </ScrollView>
  );
}

function Option({ label, active, onPress, compact = false }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.option, active && styles.optionActive, compact && styles.optionCompact]}>
      {active ? <View style={styles.optionDot} /> : null}
      <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, placeholder, keyboardType }: { label: string; value: string; placeholder: string; keyboardType?: 'numeric' }) {
  const [text, setText] = useState(value);
  return (
    <View style={styles.metaField}>
      <FormLabel>{label}</FormLabel>
      <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} style={styles.input} />
    </View>
  );
}

function Pending({ label, value }: { label: string; value: string }) {
  return <View style={styles.pendingRow}><Text style={styles.pendingLabel}>{label}</Text><Text style={styles.pendingValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 42, gap: 16 },
  columns: { gap: 15 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { flex: 1.65, gap: 15, minWidth: 0 },
  sideColumn: { flex: 1, minWidth: 0, gap: 15 },
  uploadPanel: { minHeight: 250, alignItems: 'center', justifyContent: 'center', paddingVertical: 25, backgroundColor: colors.cyanSoft, borderStyle: 'dashed', borderColor: '#9BCBD8' },
  uploadIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  uploadIconText: { color: colors.mint, fontSize: 33, fontWeight: '700', lineHeight: 37 },
  uploadTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  uploadCopy: { color: colors.textSoft, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, maxWidth: 430 },
  formatList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
  formatChip: { color: colors.textSoft, backgroundColor: colors.panelRaised, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  uploadActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  browseButton: { minWidth: 145 },
  sampleButton: { minWidth: 155 },
  secondaryButtonText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  quietButtonText: { color: colors.textSoft, fontSize: 11, fontWeight: '700' },
  localNote: { color: colors.muted, textAlign: 'center', fontSize: 9, lineHeight: 14, marginTop: 13 },
  selectedFile: { width: '100%', maxWidth: 490, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, padding: 9, borderRadius: 10, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1 },
  fileGlyph: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.mintSoft },
  fileGlyphText: { color: colors.mint, fontSize: 8, fontWeight: '800' },
  selectedFileCopy: { flex: 1, minWidth: 0, gap: 3 },
  selectedFileName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  selectedFileStatus: { color: colors.muted, fontSize: 9 },
  removeFile: { padding: 8 },
  removeFileText: { color: colors.rose, fontSize: 10, fontWeight: '700' },
  errorText: { color: colors.rose, fontSize: 11, marginTop: 8 },
  optionsPanel: { gap: 12 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  option: { flex: 1, minWidth: 116, minHeight: 37, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  optionActive: { borderColor: colors.cyan, backgroundColor: colors.cyanSoft },
  optionCompact: { minWidth: 72, minHeight: 34, flex: 1 },
  optionDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.mint },
  optionText: { color: colors.textSoft, fontSize: 10, fontWeight: '700' },
  optionTextActive: { color: colors.mint },
  optionColumns: { gap: 13, marginTop: 3 },
  optionColumnsWide: { flexDirection: 'row' },
  optionGroup: { flex: 1, gap: 3 },
  metadataPanel: { gap: 11 },
  metadataGrid: { gap: 9 },
  metadataGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  metaField: { flex: 1, minWidth: 145, gap: 7 },
  input: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.text, backgroundColor: colors.backgroundSoft, fontSize: 11 },
  runActions: { alignItems: 'center', gap: 8 },
  runButton: { width: '100%', minHeight: 52 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  runNote: { color: colors.muted, textAlign: 'center', fontSize: 10, lineHeight: 15 },
  qualityPanel: { gap: 12 },
  emptySignal: { minHeight: 198, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative', borderRadius: 11, backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border, padding: 18 },
  emptySignalGrid: { ...StyleSheet.absoluteFill, opacity: 0.45, backgroundColor: 'transparent', borderColor: 'rgba(0, 210, 255, 0.12)', borderWidth: 1 },
  emptySignalMark: { color: '#00C49F', fontSize: 30, lineHeight: 35, opacity: 0.75 },
  emptySignalTitle: { color: '#EAF7FA', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  emptySignalCopy: { maxWidth: 240, color: '#B6CBD4', textAlign: 'center', fontSize: 10, lineHeight: 15, marginTop: 5 },
  pendingRows: { gap: 3 },
  pendingRow: { minHeight: 34, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pendingLabel: { color: colors.textSoft, fontSize: 10 },
  pendingValue: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  privacyPanel: { flexDirection: 'row', gap: 11, backgroundColor: colors.cyanSoft },
  privacyIcon: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#D0EEF6', alignItems: 'center', justifyContent: 'center' },
  privacyIconText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  privacyCopy: { flex: 1, gap: 5 },
  privacyTitle: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  privacyText: { color: colors.textSoft, fontSize: 10, lineHeight: 15 },
});
