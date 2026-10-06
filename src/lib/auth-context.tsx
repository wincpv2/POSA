import * as AuthSession from 'expo-auth-session';
import { getQueryParams } from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { cancelOfflineSignalDownloads } from './inference';
import { clearUserOfflineCache } from './offline-cache';
import { supabase } from './supabase';

// Set EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN in .env to limit Google's account picker.
const allowedDomain = process.env.EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN?.trim() || undefined;

// Completes the in-app browser session when the OAuth redirect lands back in the app.
WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventReceived = true;
      setSession(newSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('Could not restore auth session:', error.message);
      // A sign-in event may arrive while AsyncStorage is being read. Do not
      // overwrite that fresh session with the earlier empty snapshot.
      if (!authEventReceived) setSession(data.session);
      setLoading(false);
    }).catch((error: unknown) => {
      console.warn('Could not restore auth session:', error);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Make sure the signed-in clinician has a profile row. The signup trigger only
  // runs once per account, so a deleted profile would otherwise never come back.
  const userId = session?.user?.id;
  const fullName = session?.user?.user_metadata?.full_name;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .upsert({ id: userId, display_name: typeof fullName === 'string' ? fullName : null }, { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn('Could not ensure profile:', error.message); });
  }, [userId, fullName]);

  async function signInWithGoogle() {
    // matches app.json's "scheme": "posaapp" — must also be added to Supabase's
    // Redirect URLs allow-list (Authentication > URL Configuration) as posaapp://auth/callback
    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
      ? new URL('/auth/callback', window.location.origin).toString()
      : AuthSession.makeRedirectUri({ scheme: 'posaapp', path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // On web, use a same-window redirect: opening an OAuth popup after this
        // async request loses the original click gesture and browsers block it.
        skipBrowserRedirect: Platform.OS !== 'web',
        // Optional: only show one organisation's accounts in Google's picker
        // (e.g. email.kmutnb.ac.th). A hint, not a lock — the real check is the
        // hook_restrict_signup_domain auth hook on the server.
        ...(allowedDomain ? { queryParams: { hd: allowedDomain } } : {}),
      },
    });
    if (error) throw error;
    if (!data?.url) return;
    if (Platform.OS === 'web') return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // The user closed the Google window themselves; not an error.
    if (result.type === 'cancel' || result.type === 'dismiss') return;
    if (result.type !== 'success' || !result.url) throw new Error(`Sign-in did not complete (${result.type})`);

    // Supabase returns the tokens in the URL hash (#access_token=...), which
    // Linking.parse ignores; getQueryParams reads both ?query and #hash.
    const { params, errorCode } = getQueryParams(result.url);
    if (errorCode || params.error_description || params.error) {
      throw new Error(params.error_description ?? params.error ?? errorCode ?? 'Sign-in failed');
    }
    const { access_token, refresh_token } = params;
    if (!access_token || !refresh_token) throw new Error('Sign-in returned no session tokens');

    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) throw sessionError;
  }

  async function signOut() {
    const userId = session?.user.id;
    if (userId) {
      cancelOfflineSignalDownloads(userId);
      await clearUserOfflineCache(userId).catch(() => {});
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
