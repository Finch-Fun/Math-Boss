// Firebase configuration comes only from environment variables (see .env.example). Pure: no SDK imports.
export type Env = Record<string, string | undefined>;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export type ConfigResult =
  | { ok: true; config: FirebaseWebConfig; useEmulator: boolean }
  | { ok: false; missing: string[]; useEmulator: boolean };

const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;
const clean = (v: string | undefined): string => (v ?? '').trim();

export function readFirebaseConfig(env: Env): ConfigResult {
  const useEmulator = clean(env.VITE_USE_FIREBASE_EMULATOR) === 'true';
  if (useEmulator) {
    // The emulators accept placeholder credentials; only a project id is needed (use a "demo-" id so nothing real is touched).
    const projectId = clean(env.VITE_FIREBASE_PROJECT_ID) || 'demo-math-boss';
    return { ok: true, useEmulator, config: { apiKey: 'demo-key', authDomain: 'localhost', projectId, appId: 'demo-app' } };
  }
  const missing = REQUIRED.filter((k) => !clean(env[k]));
  if (missing.length) return { ok: false, missing: [...missing], useEmulator };
  return {
    ok: true,
    useEmulator,
    config: {
      apiKey: clean(env.VITE_FIREBASE_API_KEY),
      authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN),
      projectId: clean(env.VITE_FIREBASE_PROJECT_ID),
      appId: clean(env.VITE_FIREBASE_APP_ID),
      storageBucket: clean(env.VITE_FIREBASE_STORAGE_BUCKET) || undefined,
      messagingSenderId: clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID) || undefined,
    },
  };
}
