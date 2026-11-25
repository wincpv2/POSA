import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { cancelOfflineSignalDownloads } from './inference';
import { clearUserOfflineCache } from './offline-cache';
import { archiveSession, datasetMode } from './local-dataset';
import { getSupabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  if (datasetMode) return <AuthContext.Provider value={{ session: archiveSession, loading: false, signIn: async () => {}, createAccount: async () => {}, signOut: async () => {} }}>{children}</AuthContext.Provider>;
  return <DatabaseAuthProvider>{children}</DatabaseAuthProvider>;
}

function DatabaseAuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
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
  }, [supabase]);

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
  }, [supabase, userId, fullName]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function createAccount(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    if (!data.session) throw new Error('Account created. Check the local auth settings for email confirmation before signing in.');
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
    <AuthContext.Provider value={{ session, loading, signIn, createAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
