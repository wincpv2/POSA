import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getQueryParams } from 'expo-auth-session/build/QueryParams';

import { colors } from '@/components/posa-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [callback] = useState(() => typeof window === 'undefined' ? null : getQueryParams(window.location.href));
  const { params, errorCode } = callback ?? { params: {}, errorCode: null };
  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  const [error, setError] = useState<string | null>(
    errorCode || params.error || params.error_description
      ? params.error_description ?? params.error ?? errorCode ?? 'Sign-in failed'
      : !accessToken || !refreshToken
        ? 'Sign-in returned no session tokens. Please try again.'
        : null,
  );

  useEffect(() => {
    if (error) return;
    if (!accessToken || !refreshToken) return;
    void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      else window.history.replaceState(null, '', window.location.pathname);
    });
  }, [accessToken, error, refreshToken]);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background, padding: 24 }}>
      {error ? <Text style={{ color: colors.text, textAlign: 'center' }}>{error}</Text> : <><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.text }}>Completing sign-in…</Text></>}
    </View>
  );
}
