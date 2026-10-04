import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { createPatientDashboardLink, type ShareLink } from '@/lib/queries';

import { AppButton, GlassPanel, PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';

// Lets the clinician give the patient a QR code or link to their own
// dashboard (every night recorded for them). Patients open it without an
// account (see patient-access.tsx).
export default function ShareWithPatient({ patientId }: { patientId: string }) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try { setLink(await createPatientDashboardLink(patientId)); }
    catch (reason) { setError(typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not create the link.'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link.url);
    setCopied(true);
  };

  return (
    <GlassPanel style={styles.panel}>
      <Text style={styles.heading}>Patient dashboard link</Text>
      <Text style={styles.copy}>The patient scans the QR code or opens the link to see their dashboard: every night recorded for them, including later ones. It shows no name or personal details, and stops working after it expires.</Text>
      {link ? (
        <View style={styles.result}>
          <View accessibilityRole="image" accessibilityLabel="QR code for the patient's dashboard link" style={styles.qr}>
            <QRCode value={link.url} size={196} color="#02033A" backgroundColor="#FFFFFF" />
          </View>
          <View style={styles.linkBox}><Text selectable style={styles.linkText}>{link.url}</Text></View>
          <View style={styles.actions}>
            <AppButton compact onPress={() => { void copy(); }}><Text style={styles.primaryText}>{copied ? 'Copied ✓' : 'Copy link'}</Text></AppButton>
            <AppButton compact variant="quiet" onPress={() => { void create(); }} disabled={busy}><Text style={styles.quietText}>New link</Text></AppButton>
          </View>
          <Text style={styles.expiry}>Works until {new Date(link.expiresAt).toLocaleDateString()}.</Text>
        </View>
      ) : (
        <AppButton onPress={() => { void create(); }} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Creating…' : 'Create QR code and link'}</Text></AppButton>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  result: { alignItems: 'center', gap: 12 },
  qr: { padding: 14, borderRadius: 20, backgroundColor: '#FFFFFF' },
  linkBox: { alignSelf: 'stretch', padding: 10, borderRadius: 12, backgroundColor: colors.scrim, borderWidth: 1, borderColor: colors.border },
  linkText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  primaryText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  quietText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  expiry: { color: colors.muted, fontSize: 12 },
  error: { alignSelf: 'stretch', color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
});
