import '../global.css';

import { ActivityIndicator, View } from 'react-native';

import LoginScreen from '@/components/login-screen';
import { colors } from '@/components/posa-theme';
import PosaShell from '@/components/posa-shell';
import { AuthProvider, useAuth } from '@/lib/auth-context';

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.mint} />
      </View>
    );
  }

  return session ? <PosaShell /> : <LoginScreen />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
