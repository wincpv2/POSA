import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

const missingSupabaseEnv = [
  !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean);

if (missingSupabaseEnv.length > 0) {
  throw new Error(
    `Missing ${missingSupabaseEnv.join(' and ')}. Check the project-root .env and restart Expo with its cache cleared (npx expo start --clear).`
  );
}

// Expo Router's web output pre-renders on the server (Node), where `window`
// doesn't exist. AsyncStorage's web implementation touches it eagerly, and
// supabase-js reads storage immediately on client creation (not just in a
// useEffect) — so a bare AsyncStorage here crashes the whole SSR pass. This
// adapter no-ops during SSR and only touches AsyncStorage once actually
// running in a browser or the native app.
const isServer = typeof window === 'undefined';

const ssrSafeStorage = {
  getItem: (key: string) => (isServer ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (isServer ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (isServer ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
