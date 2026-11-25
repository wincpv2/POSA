import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

import { colors, fonts } from './posa-theme';
import { PosaMark } from './posa-logo';
import WatercolorBackground from './watercolor-background';

// Verbatim disclaimer text from the backend/auth course guide (p.13/24) — see
// posa.md "Security & medical-app compliance". Required on the login screen.
const DISCLAIMER = 'แอปพลิเคชันนี้ใช้สำหรับการศึกษาทางวิศวกรรมชีวการแพทย์เท่านั้น';

export default function LoginScreen({ onBack }: { onBack?: () => void } = {}) {
  const { signIn, createAccount } = useAuth();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = creating ? 'Create account' : 'Sign in';

  async function submit() {
    if (busy) return;
    const accountEmail = email.trim();
    const displayName = fullName.trim();
    if (!accountEmail || !password || (creating && !displayName)) {
      setError(creating ? 'Enter your name, email, and password.' : 'Enter your email and password.');
      return;
    }
    if (creating && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (creating) await createAccount(accountEmail, password, displayName);
      else await signIn(accountEmail, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient pointerEvents="none" colors={[colors.background, colors.gradientEnd]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <WatercolorBackground />
      <ScrollView contentContainerStyle={styles.foreground} keyboardShouldPersistTaps="handled" style={styles.scroll}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} disabled={busy} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        ) : null}
        <PosaMark size={72} />
        <Text style={styles.brandName}>POSA</Text>
        <Text style={styles.title}>Sleep Lab Workstation</Text>

        <View style={styles.form}>
          {creating ? (
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                accessibilityLabel="Full name"
                autoComplete="name"
                editable={!busy}
                value={fullName}
                onChangeText={setFullName}
                style={styles.input}
              />
            </View>
          ) : null}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!busy}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete={creating ? 'new-password' : 'current-password'}
              editable={!busy}
              returnKeyType="done"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              style={styles.input}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel={action}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}>
            {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.buttonText}>{action}</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setCreating(!creating);
              setPassword('');
              setError(null);
            }}
            style={styles.switchMode}>
            <Text style={styles.backText}>{creating ? 'Back to sign in' : 'Create a local account'}</Text>
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', backgroundColor: colors.background },
  scroll: { flex: 1, zIndex: 1 },
  foreground: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, paddingTop: 68 },
  brandName: { color: colors.text, fontFamily: fonts.extraBold, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14, marginBottom: 12 },
  form: { width: '100%', maxWidth: 320, gap: 12 },
  field: { gap: 5 },
  label: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.muted, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.background, fontFamily: fonts.regular, fontSize: 16 },
  button: { backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.85 },
  switchMode: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', top: 16, left: 16, minHeight: 44, minWidth: 72, justifyContent: 'center' },
  backText: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  buttonText: { color: colors.accentText, fontFamily: fonts.extraBold, fontSize: 15 },
  error: { color: colors.accentText, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden', fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', maxWidth: 320 },
  disclaimer: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', maxWidth: 320, marginTop: 20 },
});
