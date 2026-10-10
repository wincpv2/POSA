import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getQueryParams } from 'expo-auth-session/build/QueryParams';

import { colors } from '@/components/posa-theme';
import { completeOAuthTokens, useAuth } from '@/lib/auth-context';
import WatercolorBackground from '@/components/watercolor-background';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const navigating = useRef(false);
  const [callback, setCallback] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined' ? getQueryParams(window.location.href) : null);
  const [callbackLoaded, setCallbackLoaded] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const acceptUrl = (url: string | null) => {
      if (!url) return;
      const next = getQueryParams(url);
      if (next.params.access_token || next.params.error || next.params.error_description) {
        setCallback(next);
        setCallbackLoaded(true);
      }
    };
    void Linking.getInitialURL().then((url) => { if (active) acceptUrl(url); }).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => acceptUrl(url));
    return () => { active = false; subscription.remove(); };
  }, []);
  const { params, errorCode } = callback ?? { params: {}, errorCode: null };
  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  const callbackError = errorCode || params.error_description || params.error;
  const [error, setError] = useState<string | null>(null);
  const errorMessage = callbackError
    ? params.error_description ?? params.error ?? errorCode ?? 'Sign-in failed'
    : callbackLoaded && (!accessToken || !refreshToken)
      ? 'Sign-in returned no session tokens. Please try again.'
      : error;

  useEffect(() => {
    if (callbackLoaded) return;
    const timeout = setTimeout(() => setError('Could not receive the Google sign-in response. Please try again.'), 30_000);
    return () => clearTimeout(timeout);
  }, [callbackLoaded]);

  const returnHome = useCallback(() => {
    if (navigating.current) return;
    navigating.current = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.replace('/');
    else router.replace('/');
  }, [router]);

  useEffect(() => {
    if (errorMessage || !callbackLoaded) return;
    if (!accessToken || !refreshToken) return;
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setError('Sign-in is taking too long. Please return and try again.');
    }, 30_000);
    void completeOAuthTokens(accessToken, refreshToken).then(() => {
      if (!active) return;
      returnHome();
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not complete sign-in. Please try again.');
    });
    return () => { active = false; clearTimeout(timeout); };
  }, [accessToken, callbackLoaded, errorMessage, refreshToken, returnHome]);

  useEffect(() => {
    if (session) returnHome();
  }, [returnHome, session]);

  return (
    <View style={{ flex: 1, position: 'relative', backgroundColor: colors.background }}>
      <WatercolorBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, position: 'relative', zIndex: 1 }}>
      {errorMessage ? <Text style={{ color: colors.text, textAlign: 'center' }}>{errorMessage}</Text> : <><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.text }}>Completing sign-in…</Text></>}
      {errorMessage ? <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}><Text style={{ color: colors.text, fontWeight: '700' }}>Return to sign in</Text></Pressable> : null}
      </View>
    </View>
  );
}
