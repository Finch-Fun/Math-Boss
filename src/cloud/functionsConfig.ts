// Where the browser finds the trusted Cloud Functions. Pure (no SDK) so it can be unit-tested.
//
// Production: the callable functions run in ONE region, chosen when they are deployed (functions/src/config.ts). The browser must ask
// that same region or every call fails with "not found". The default is us-central1; to use another region set the SAME value in
// VITE_FUNCTIONS_REGION (browser build) and MATHBOSS_FUNCTIONS_REGION (functions/.env at deploy time).
// Emulator: only when VITE_USE_FIREBASE_EMULATOR=true does the browser talk to 127.0.0.1; otherwise it never does.
export const DEFAULT_FUNCTIONS_REGION = 'us-central1';
export const EMULATOR_FUNCTIONS = { host: '127.0.0.1', port: 5001 } as const;

const REGION = /^[a-z]+-[a-z]+[0-9]+$/;

/** A valid region name, or the default. A malformed value is ignored rather than producing an unreachable URL. */
export function resolveFunctionsRegion(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  return REGION.test(v) ? v : DEFAULT_FUNCTIONS_REGION;
}

export interface FunctionsPlan {
  region: string;
  /** Non-null only in emulator mode. */
  emulator: { host: string; port: number } | null;
}

export function functionsPlan(useEmulator: boolean, env: Record<string, string | undefined>): FunctionsPlan {
  return { region: resolveFunctionsRegion(env.VITE_FUNCTIONS_REGION), emulator: useEmulator ? { ...EMULATOR_FUNCTIONS } : null };
}
