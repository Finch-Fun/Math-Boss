// Demo mode vs Firebase mode. Demo mode never needs credentials and never loads the Firebase SDK.
import { readFirebaseConfig, type Env } from './config';

export type AppMode = 'demo' | 'firebase';

export interface ModeInfo {
  /** 'firebase' only when a complete configuration exists; otherwise the app runs the local demo. */
  available: AppMode;
  missing: string[];
}

export function resolveMode(env: Env): ModeInfo {
  const result = readFirebaseConfig(env);
  return result.ok ? { available: 'firebase', missing: [] } : { available: 'demo', missing: result.missing };
}

export const DEMO_STORAGE_KEY = 'math-boss-prototype-v1';

/**
 * Local practice gameplay inside a Firebase classroom uses its own storage key per user and classroom, so it can
 * never overwrite the demo save or another student's practice save. It is simulated and NOT authoritative.
 */
export const practiceStorageKey = (uid: string, classroomId: string): string => `math-boss-practice-v1:${uid}:${classroomId}`;
