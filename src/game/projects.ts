import { PROJECT_DEFS, PROJECT_KEYS, PROJECT_REPEAT_GROWTH, REFERENCE_CLASS_SIZE } from './constants';
import { castleMaxHp, checkBreachRecovery, getStudent, log } from './core';
import type { GameState, ProjectKey, ProjectState, Result } from './types';

export const freshProjects = (): Record<ProjectKey, ProjectState> =>
  Object.fromEntries(PROJECT_KEYS.map((k) => [k, { level: 0, funded: 0 }])) as Record<ProjectKey, ProjectState>;

/** Base cost scales with class size (relative to the 25-student reference) and grows x1.5 per repeat purchase. */
export function projectCost(key: ProjectKey, level: number, classSize: number): number {
  const [n, m] = PROJECT_REPEAT_GROWTH;
  const num = BigInt(PROJECT_DEFS[key].baseCost) * BigInt(classSize) * BigInt(n) ** BigInt(level);
  const den = BigInt(REFERENCE_CLASS_SIZE) * BigInt(m) ** BigInt(level);
  return Math.max(1, Number((num + den - 1n) / den));
}

export const currentProjectCost = (s: GameState, key: ProjectKey): number =>
  projectCost(key, s.projects[key].level, s.students.length);

export function isProjectMaxed(s: GameState, key: ProjectKey): boolean {
  const max = PROJECT_DEFS[key].maxLevel;
  return max !== null && s.projects[key].level >= max;
}

function completeProject(s: GameState, key: ProjectKey): void {
  const p = s.projects[key];
  const before = castleMaxHp(s);
  p.level += 1;
  p.funded = 0;
  if (key === 'walls') {
    s.battle.castleHp += castleMaxHp(s) - before;
  } else if (key === 'repairs') {
    const max = castleMaxHp(s);
    s.battle.castleHp = Math.min(max, s.battle.castleHp + Math.round(0.2 * max));
    checkBreachRecovery(s);
  }
  log(s, `Project complete: ${PROJECT_DEFS[key].label}!`);
}

/** Donations deduct coins immediately; excess beyond the remaining cost is never charged. */
export function donate(s: GameState, studentId: string, key: ProjectKey, amount: number): Result<{ charged: number; completed: boolean }> {
  const st = getStudent(s, studentId);
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, reason: 'Enter a whole number of coins (1 or more).' };
  if (isProjectMaxed(s, key)) return { ok: false, reason: `${PROJECT_DEFS[key].label} is already at its maximum this week.` };
  if (amount > st.coins) return { ok: false, reason: 'You do not have that many coins.' };
  const p = s.projects[key];
  const remaining = currentProjectCost(s, key) - p.funded;
  const charged = Math.min(amount, remaining);
  st.coins -= charged;
  st.weekDonated += charged;
  s.stats.donated += charged;
  p.funded += charged;
  const completed = p.funded >= currentProjectCost(s, key);
  if (completed) completeProject(s, key);
  return { ok: true, charged, completed };
}
