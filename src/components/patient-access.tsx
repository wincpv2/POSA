import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { linkFromInput, type PatientLink } from '@/lib/queries';

import { PublicScreen } from './public-screen';
import { AppButton, FormLabel, GlassPanel, PosaText as Text } from './posa-ui';
import { colors, fonts } from './posa-theme';
import { PatientLanguageSwitch, usePatientLanguage, type PatientCopy } from './patient-language';

type Mode = 'scan' | 'paste';

// Patients open the one study their clinician shared with them. Scanning the
// QR code is the default; pasting the link is the fallback (no camera, web).
export default function PatientAccess({ onBack, onToken }: { onBack: () => void; onToken: (link: PatientLink) => void }) {
  const [mode, setMode] = useState<Mode>('scan');
  const { language, setLanguage, copy } = usePatientLanguage();

  return (
    <PublicScreen onBack={onBack} backLabel={'← ' + copy.back} headerAction={<PatientLanguageSwitch language={language} onChange={setLanguage} />}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{copy.patientAccess}</Text>
        <Text style={styles.title}>{copy.openDashboard}</Text>
        <Text style={styles.copy}>{copy.accessCopy}</Text>
      </View>
      <View accessibilityRole="tablist" style={styles.segment}>
        <Segment label={copy.scanQr} active={mode === 'scan'} onPress={() => setMode('scan')} />
        <Segment label={copy.pasteLink} active={mode === 'paste'} onPress={() => setMode('paste')} />
      </View>
      {mode === 'scan' ? <ScanPanel copy={copy} onToken={onToken} onUsePaste={() => setMode('paste')} /> : <PastePanel copy={copy} onToken={onToken} />}
    </PublicScreen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.segmentItem, active && styles.segmentActive]}>
      <Text selectable={false} style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ScanPanel({ copy, onToken, onUsePaste }: { copy: PatientCopy; onToken: (link: PatientLink) => void; onUsePaste: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState('');
  const handled = useRef(false);

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const link = linkFromInput(data);
    if (!link) { setError(copy.invalidQr); return; }
    handled.current = true;
    onToken(link);
  };

  if (!permission) return <GlassPanel style={styles.panel}><ActivityIndicator color={colors.accent} /></GlassPanel>;

  if (!permission.granted) {
    return (
      <GlassPanel style={styles.panel}>
        <Text style={styles.heading}>{copy.cameraAccess}</Text>
        <Text style={styles.copy}>{copy.cameraReason}</Text>
        {permission.canAskAgain ? <AppButton onPress={() => { void requestPermission(); }}><Text style={styles.primaryText}>{copy.allowCamera}</Text></AppButton>
          : <Text style={styles.copy}>{copy.cameraOff}</Text>}
        <AppButton variant="quiet" onPress={onUsePaste}><Text style={styles.quietText}>{copy.pasteInstead}</Text></AppButton>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel style={styles.panel}>
      <View style={styles.cameraFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
          onMountError={() => setError(copy.cameraError)}
        />
      </View>
      <Text style={styles.copy}>{copy.pointCamera}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppButton variant="quiet" onPress={onUsePaste}><Text style={styles.quietText}>{copy.pasteInstead}</Text></AppButton>
    </GlassPanel>
  );
}

function PastePanel({ copy, onToken }: { copy: PatientCopy; onToken: (link: PatientLink) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const open = () => {
    const link = linkFromInput(value);
    if (!link) { setError(copy.invalidLink); return; }
    setError('');
    onToken(link);
  };
  return (
    <GlassPanel style={styles.panel}>
      <FormLabel>{copy.resultLink}</FormLabel>
      <TextInput value={value} onChangeText={setValue} onSubmitEditing={open} placeholder={copy.pastePlaceholder} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} accessibilityLabel={copy.resultLink} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppButton onPress={open} disabled={!value.trim()}><Text style={styles.primaryText}>{copy.open}</Text></AppButton>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6 },
  eyebrow: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 999, backgroundColor: colors.panelDeep, borderWidth: 1, borderColor: colors.border },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, cursor: 'pointer', userSelect: 'none' } as never,
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  segmentTextActive: { color: colors.accentText },
  panel: { gap: 12 },
  cameraFrame: { width: '100%', aspectRatio: 1, maxWidth: 360, alignSelf: 'center', overflow: 'hidden', borderRadius: 20, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.scrim },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.scrim, paddingHorizontal: 12, color: colors.text, fontSize: 14, fontFamily: fonts.regular },
  error: { color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  primaryText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
  quietText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
