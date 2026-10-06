import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

import { colors, fonts } from './posa-theme';
import { PosaMark } from './posa-logo';
import WatercolorBackground from './watercolor-background';

// Verbatim disclaimer text from the backend/auth course guide (p.13/24) — see
// posa.md "Security & medical-app compliance". Required on the login screen.
const DISCLAIMER = 'แอปพลิเคชันนี้ใช้สำหรับการศึกษาทางวิศวกรรมชีวการแพทย์เท่านั้น';

export default function LoginScreen({ onBack }: { onBack?: () => void } = {}) {
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
      <LinearGradient pointerEvents="none" colors={[colors.background, colors.gradientEnd]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <WatercolorBackground />
      <View style={styles.foreground}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      ) : null}
      <PosaMark size={72} />
      <Text style={styles.brandName}>POSA</Text>
      <Text style={styles.title}>Sleep Lab Workstation</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handlePress}
        disabled={busy}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', backgroundColor: colors.background },
  foreground: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, position: 'relative', zIndex: 1 },
  brandName: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14, marginBottom: 12 },
  button: { backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999, minWidth: 240, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.85 },
  back: { position: 'absolute', top: 16, left: 16, minHeight: 44, minWidth: 72, justifyContent: 'center' },
  backText: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  buttonText: { color: colors.accentText, fontFamily: fonts.extraBold, fontSize: 15 },
  error: { color: colors.accentText, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden', fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', maxWidth: 320 },
  disclaimer: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', maxWidth: 320, marginTop: 20 },
});
