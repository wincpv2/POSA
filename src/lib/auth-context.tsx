import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    // matches app.json's "scheme": "posaapp" — must also be added to Supabase's
    // Redirect URLs allow-list (Authentication > URL Configuration) as posaapp://auth/callback
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'posaapp', path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return;

    const { queryParams } = Linking.parse(result.url);
    const access_token = queryParams?.access_token;
    const refresh_token = queryParams?.refresh_token;
    if (typeof access_token === 'string' && typeof refresh_token === 'string') {
      const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessionError) throw sessionError;
    }
  }

  async function signOut() {
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
