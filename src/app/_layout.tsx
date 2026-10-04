import '../global.css';

import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Slot, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';

import PosaShell from '@/components/posa-shell';
import RoleSelect from '@/components/role-select';
import { colors, fonts } from '@/components/posa-theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';

function Spinner() {
  return <View accessibilityRole="progressbar" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.accent} /></View>;
}

function Gate() {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  // Patient links (dashboard /p/…, single study /shared/…) open for anyone,
  // signed in or not.
  if (pathname.startsWith('/p/') || pathname.startsWith('/shared/')) return <Slot />;
  if (loading) return <Spinner />;
  return session ? <PosaShell /> : <RoleSelect />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fonts.regular]: Nunito_400Regular,
    [fonts.semibold]: Nunito_600SemiBold,
    [fonts.bold]: Nunito_700Bold,
    [fonts.extraBold]: Nunito_800ExtraBold,
  });
  if (!loaded && !error) return <Spinner />;
  return <GestureHandlerRootView style={{ flex: 1 }}><AuthProvider><Gate /></AuthProvider></GestureHandlerRootView>;
}
