import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@/components/posa-theme';

export default function AuthCallbackScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.text }}>Completing sign-in…</Text>
    </View>
  );
}
