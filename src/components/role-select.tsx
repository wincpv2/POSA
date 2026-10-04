import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import LoginScreen from './login-screen';
import PatientAccess from './patient-access';
import PatientDashboard from './patient-dashboard';
import PatientResult from './patient-result';
import { PublicScreen, SHORT_DISCLAIMER } from './public-screen';
import { GlassPanel, PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';

type View_ = { kind: 'choose' } | { kind: 'clinician' } | { kind: 'patient' } | { kind: 'result' | 'dashboard'; token: string };

// First screen when nobody is signed in: clinicians go on to Google sign-in;
// patients open a result their clinician shared (QR code or link), no account.
export default function RoleSelect() {
  const [view, setView] = useState<View_>({ kind: 'choose' });
  const choose = () => setView({ kind: 'choose' });

  if (view.kind === 'clinician') return <LoginScreen onBack={choose} />;
  if (view.kind === 'patient') return <PatientAccess onBack={choose} onToken={(link) => setView({ kind: link.kind === 'study' ? 'result' : 'dashboard', token: link.token })} />;
  if (view.kind === 'result') return <PatientResult token={view.token} onBack={() => setView({ kind: 'patient' })} />;
  if (view.kind === 'dashboard') return <PatientDashboard token={view.token} onBack={() => setView({ kind: 'patient' })} />;

  return (
    <PublicScreen>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>WELCOME</Text>
        <Text style={styles.title}>Who is using POSA?</Text>
        <Text style={styles.copy}>Choose how you want to continue.</Text>
      </View>
      <RoleCard
        title="I'm a clinician"
        description="Sign in with Google to upload ECG studies and review results."
        icon={<><Circle cx="12" cy="8" r="4" /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" /><Path d="M17 4h4M19 2v4" /></>}
        onPress={() => setView({ kind: 'clinician' })}
      />
      <RoleCard
        title="I'm a patient"
        description="See your sleep dashboard: scan the QR code or open the link your clinician gave you. No account needed."
        icon={<><Rect x="3" y="3" width="7" height="7" rx="1" /><Rect x="14" y="3" width="7" height="7" rx="1" /><Rect x="3" y="14" width="7" height="7" rx="1" /><Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>}
        onPress={() => setView({ kind: 'patient' })}
      />
      <Text style={styles.disclaimer}>{SHORT_DISCLAIMER}</Text>
    </PublicScreen>
  );
}

function RoleCard({ title, description, icon, onPress }: { title: string; description: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${description}`} onPress={onPress} style={({ pressed }) => [styles.cardPress, pressed && styles.pressed]}>
      <GlassPanel style={styles.card}>
        <View style={styles.iconWrap}>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.accentText} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{icon}</Svg>
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.copy}>{description}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginBottom: 4 },
  eyebrow: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  cardPress: { borderRadius: 24 },
  pressed: { opacity: 0.85 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  chevron: { color: colors.text, fontSize: 28, fontWeight: '700' },
  disclaimer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
