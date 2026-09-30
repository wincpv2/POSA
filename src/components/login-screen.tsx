import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

import { colors } from './posa-theme';

// Verbatim disclaimer text from the backend/auth course guide (p.13/24) — see
// posa.md "Security & medical-app compliance". Required on the login screen.
const DISCLAIMER = 'แอปพลิเคชันนี้ใช้สำหรับการศึกษาทางวิศวกรรมชีวการแพทย์เท่านั้น';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.brandMark}>
        <Text style={styles.brandGlyph}>∿</Text>
      </View>
      <Text style={styles.brandName}>POSA</Text>
      <Text style={styles.title}>Sleep Lab Workstation</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handlePress}
        disabled={busy}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.background, padding: 24 },
  brandMark: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brandGlyph: { color: colors.mint, fontSize: 32, fontWeight: '700' },
  brandName: { color: colors.text, fontFamily: 'Georgia', fontWeight: '700', fontSize: 22 },
  title: { color: colors.textSoft, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  button: { backgroundColor: colors.mint, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10, minWidth: 230, alignItems: 'center' },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.background, fontWeight: '800', fontSize: 13 },
  error: { color: colors.rose, fontSize: 12, textAlign: 'center', maxWidth: 300 },
  disclaimer: { color: colors.muted, fontSize: 10, textAlign: 'center', maxWidth: 300, marginTop: 20 },
});
