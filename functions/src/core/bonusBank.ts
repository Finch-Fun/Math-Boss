// The Bonus Question bank lives ONLY on the trusted side, and its CONTENT is not in this repository at all.
//
// This repository is public, so any bank committed here (even under functions/) would reveal the answers. The real bank is a private
// Firestore document, `serverOnly/bonusBank`, that no client can read or write (see firestore.rules) and that the owner loads with
// `npm run seed:bonus` using the Admin SDK. The Functions code below validates and serves it; if it is missing or malformed, Bonus
// Questions fail closed (disabled) instead of falling back to any public bank.
//
// The demo mode has its own public, clearly separate bank in src/game/questions.ts (DEMO_BONUS_BANK). It is never used by the server.
export interface BonusQuestion {
  id: string;
  prompt: string;
  choices: string[];
  /** Index into `choices`. Never sent to a student before they have answered. */
  correct: number;
  explanation: string;
}

export const BONUS_PER_WEEK = 3;
export const BONUS_BANK_DOC = 'serverOnly/bonusBank';

export interface BonusBankSource {
  /** The validated bank, or null when none is configured (Bonus Questions are then unavailable). */
  load(): Promise<BonusQuestion[] | null>;
}

/** Throws a readable error if the document is not a usable bank. Used by the seed script and by the server on load. */
export function validateBonusBank(raw: unknown): BonusQuestion[] {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list) || list.length < BONUS_PER_WEEK) throw new Error(`The bank needs at least ${BONUS_PER_WEEK} questions.`);
  const seen = new Set<string>();
  return list.map((q, i) => {
    const where = `question ${i + 1}`;
    const o = q as Partial<BonusQuestion>;
    if (typeof o.id !== 'string' || !o.id.trim() || seen.has(o.id)) throw new Error(`${where}: needs a unique id.`);
    seen.add(o.id);
    if (typeof o.prompt !== 'string' || !o.prompt.trim()) throw new Error(`${where}: missing prompt.`);
    if (!Array.isArray(o.choices) || o.choices.length < 2 || o.choices.length > 6 || o.choices.some((c) => typeof c !== 'string' || !c.trim())) {
      throw new Error(`${where}: needs 2 to 6 non-empty choices.`);
    }
    if (new Set(o.choices).size !== o.choices.length) throw new Error(`${where}: choices must be different from each other.`);
    if (!Number.isInteger(o.correct) || (o.correct as number) < 0 || (o.correct as number) >= o.choices.length) throw new Error(`${where}: "correct" must be the index of a choice.`);
    if (typeof o.explanation !== 'string') throw new Error(`${where}: missing explanation.`);
    return { id: o.id, prompt: o.prompt, choices: [...o.choices], correct: o.correct as number, explanation: o.explanation };
  });
}

/** The three questions for a campaign week (same rotation as the demo: a stable function of the week index). */
export function bonusForWeek(bank: BonusQuestion[], weekIndex: number): BonusQuestion[] {
  return Array.from({ length: BONUS_PER_WEEK }, (_, i) => bank[(weekIndex * BONUS_PER_WEEK + i) % bank.length]);
}

/** A fixed in-memory bank. Production uses the Firestore-backed source; tests pass their own fixture. */
export const staticBonusBank = (questions: BonusQuestion[] | null): BonusBankSource => ({ load: async () => questions });

/**
 * Caches a source for `ttlMs` so a busy classroom does not read the bank document on every request (one read per instance per
 * few minutes). A failed or malformed load is cached as "unavailable" for a shorter time so a bad edit cannot cause a read storm.
 */
export function cachedBonusBank(inner: BonusBankSource, now: () => number = Date.now, ttlMs = 10 * 60_000, failTtlMs = 60_000): BonusBankSource {
  let value: BonusQuestion[] | null = null;
  let until = 0;
  return {
    async load() {
      if (now() < until) return value;
      try {
        value = await inner.load();
        until = now() + ttlMs;
      } catch (e) {
        console.error('mb bonus bank unavailable:', e instanceof Error ? e.message : e);
        value = null;
        until = now() + failTtlMs;
      }
      return value;
    },
  };
}
