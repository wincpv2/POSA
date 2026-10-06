import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — copy .env.example to .env and fill in the values from the Supabase dashboard (Project Settings > Data API).'
  );
}

// Expo Router's web output pre-renders on the server (Node), where `window`
// doesn't exist. AsyncStorage's web implementation touches it eagerly, and
// supabase-js reads storage immediately on client creation (not just in a
// useEffect) — so a bare AsyncStorage here crashes the whole SSR pass. This
// adapter no-ops during SSR and only touches AsyncStorage once actually
// running in a browser or the native app.
// `window` can be absent in native runtimes too. Only disable persistence for
// the web server render; native must always use AsyncStorage for auth sessions.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const localDeviceStorage = {
  getItem: (key: string) => (isServer ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (isServer ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (isServer ? Promise.resolve() : AsyncStorage.removeItem(key)),
  getAllKeys: () => (isServer ? Promise.resolve([] as string[]) : AsyncStorage.getAllKeys()),
  multiRemove: (keys: string[]) => (isServer ? Promise.resolve() : AsyncStorage.multiRemove(keys)),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localDeviceStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
