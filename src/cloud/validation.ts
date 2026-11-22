// Pure input rules shared by the client UI and the tests. The Firestore rules re-check the structural parts;
// nothing here is a security boundary on its own.
import { defaultSettings } from '../game/sample';
import { ALL_SKILLS } from '../game/questions';
import type { BossDifficulty, DifficultyPreset, Settings } from '../game/types';
import type { ClassroomInput, ClassroomSettings, GradeLevel, JoinApproval } from './types';

/** 31 symbols: no 0/O/1/I/L so a code read aloud or copied from a whiteboard is hard to mistype. */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 8;
export const GRADE_LEVELS: GradeLevel[] = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mixed'];
export const NAME_MAX = 60;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;
const PRESETS: DifficultyPreset[] = ['foundations', 'balanced', 'challenge'];
const BOSS_LEVELS: BossDifficulty[] = ['easy', 'normal', 'hard'];

type RandomBytes = (n: number) => Uint8Array;
const cryptoBytes: RandomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Uniformly random code (rejection sampling, so no modulo bias). */
export function generateJoinCode(randomBytes: RandomBytes = cryptoBytes): string {
  const limit = 256 - (256 % JOIN_CODE_ALPHABET.length);
  let out = '';
  while (out.length < JOIN_CODE_LENGTH) {
    for (const byte of randomBytes(JOIN_CODE_LENGTH * 2)) {
      if (byte < limit && out.length < JOIN_CODE_LENGTH) out += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Accepts "abcd-efgh", " ABCD EFGH " etc. Returns null when the text cannot be a code. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.replace(/[\s-]+/g, '').toUpperCase();
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export const formatJoinCode = (code: string): string => (code.length === JOIN_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A character nickname: no real-name collection, no contact details. */
export function validateDisplayName(input: string): Checked<string> {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Pick a nickname between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters.` };
  }
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return { ok: false, error: 'Use letters, numbers, spaces, and . _ - \' only.' };
  return { ok: true, value: name };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz.length > 0 && tz.length <= 64;
  } catch {
    return false;
  }
}

export function validateSettings(s: Settings): Checked<ClassroomSettings> {
  if (!PRESETS.includes(s.difficultyPreset)) return { ok: false, error: 'Unknown question difficulty.' };
  if (!BOSS_LEVELS.includes(s.bossDifficulty)) return { ok: false, error: 'Unknown boss difficulty.' };
  if (s.skills.length < 1 || s.skills.some((k) => !ALL_SKILLS.includes(k))) return { ok: false, error: 'Choose at least one math skill.' };
  if (s.dailyQuestions.length !== 7 || s.dailyQuestions.some((n) => !Number.isInteger(n) || n < 0 || n > 20)) {
    return { ok: false, error: 'Daily Review needs a whole number from 0 to 20 for each day.' };
  }
  return { ok: true, value: { ...s, skills: [...new Set(s.skills)], dailyQuestions: [...s.dailyQuestions] } };
}

export interface ClassroomDraft {
  name: string;
  gradeLevel?: string;
  timezone?: string;
  joinApproval?: JoinApproval;
  settings?: Partial<Settings>;
}

/** Classroom creation needs only a name; everything else falls back to the game design defaults. */
export function validateClassroomInput(draft: ClassroomDraft, browserTimezone = 'America/New_York'): Checked<ClassroomInput> {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Give the classroom a name.' };
  if (name.length > NAME_MAX) return { ok: false, error: `Keep the name under ${NAME_MAX + 1} characters.` };
  const gradeLevel = (draft.gradeLevel ?? 'Mixed') as GradeLevel;
  if (!GRADE_LEVELS.includes(gradeLevel)) return { ok: false, error: 'Choose a grade level from the list.' };
  const timezone = draft.timezone ?? browserTimezone;
  if (!isValidTimezone(timezone)) return { ok: false, error: 'That timezone is not recognized (use a name like America/Chicago).' };
  const joinApproval = draft.joinApproval ?? 'teacher';
  if (joinApproval !== 'teacher' && joinApproval !== 'auto') return { ok: false, error: 'Unknown join approval setting.' };
  const settings = validateSettings({ ...defaultSettings(), ...draft.settings });
  if (!settings.ok) return settings;
  return { ok: true, value: { name, gradeLevel, timezone, joinApproval, settings: settings.value } };
}
