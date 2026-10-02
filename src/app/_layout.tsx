import '../global.css';

import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import PosaShell from '@/components/posa-shell';
import { colors, fonts } from '@/components/posa-theme';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fonts.regular]: Nunito_400Regular,
    [fonts.semibold]: Nunito_600SemiBold,
    [fonts.bold]: Nunito_700Bold,
    [fonts.extraBold]: Nunito_800ExtraBold,
  });
  if (!loaded && !error) return <View accessibilityRole="progressbar" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.accent} /></View>;
  return <PosaShell />;
}
