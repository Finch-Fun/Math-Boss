// Shared state helpers used by the engine, actions and simulated classmates. All functions mutate the state they are given.
import { BOSS_ATTACK_INTERVAL, TUNING } from './constants';
import { weekdayIndex } from './time';
import { dps } from './upgrades';
import type { GameState, Student } from './types';

export function log(s: GameState, text: string): void {
  s.log.unshift({ at: s.now, text });
  if (s.log.length > 60) s.log.length = 60;
}

export function getStudent(s: GameState, id: string): Student {
  const st = s.students.find((x) => x.id === id);
  if (!st) throw new Error(`Unknown student ${id}`);
  return st;
}

export const castleMaxHp = (s: GameState): number => Math.round(s.battle.baseCastleMaxHp * (1 + TUNING.wallsPerLevel * s.projects.walls.level));
export const armorPct = (s: GameState): number => Math.min(0.5, TUNING.armorPerLevel * s.projects.plating.level);
export const dpsBonus = (s: GameState): number => Math.min(0.25, 0.05 * s.projects.banner.level);

/** Inactive students contribute nothing. */
export function studentDps(s: GameState, st: Student): number {
  return st.activated ? dps(st.upgrades) * (1 + dpsBonus(s)) * s.dev.dpsMultiplier : 0;
}

export const classDps = (s: GameState): number => s.students.reduce((sum, st) => sum + studentDps(s, st), 0);
export const activatedCount = (s: GameState): number => s.students.filter((st) => st.activated).length;

/** Weekly activation. The boss's attack clock starts at the first activation (design §10.2 safeguard). */
export function activate(s: GameState, st: Student): boolean {
  if (st.activated) return false;
  st.activated = true;
  if (s.battle.phase === 'combat' && s.battle.nextAttackAt === null) {
    s.battle.nextAttackAt = s.now + BOSS_ATTACK_INTERVAL;
  }
  return true;
}

/** Daily Review questions unlocked so far this week (Monday through today). */
export function weeklyUnlocked(s: GameState): number {
  const today = weekdayIndex(s.now);
  let total = 0;
  for (let i = 0; i <= today; i++) total += s.settings.dailyQuestions[i] ?? 0;
  return total;
}

export const isZeroQuestionWeek = (s: GameState): boolean => s.settings.dailyQuestions.every((n) => n === 0);

/** Zero-question week exception (§10.1): everyone is activated automatically. */
export function applyZeroWeekRule(s: GameState): void {
  if (!isZeroQuestionWeek(s)) return;
  for (const st of s.students) activate(s, st);
}

export function resumeCombat(s: GameState): void {
  s.battle.phase = 'combat';
  s.battle.nextAttackAt = s.now + BOSS_ATTACK_INTERVAL;
  log(s, 'The castle has recovered. Combat resumes!');
}

export function checkBreachRecovery(s: GameState): void {
  const b = s.battle;
  if (b.phase === 'breach' && b.castleHp >= TUNING.breachRecoveryFraction * castleMaxHp(s) - 1e-6) resumeCombat(s);
}

/** Emergency reconstruction from a correct Daily Review answer. Never awards coins. */
export function emergencyRepairFromQuestion(s: GameState): void {
  if (s.battle.phase !== 'breach') return;
  const max = castleMaxHp(s);
  const add = TUNING.questionRepairFraction * max;
  s.battle.castleHp = Math.min(max, s.battle.castleHp + add);
  s.stats.emergencyRepairHp += add;
  checkBreachRecovery(s);
}

export function bossPct(s: GameState): number {
  const boss = s.battle.boss;
  if (!boss || boss.maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - boss.hp / boss.maxHp));
}

export function snapshotDay(s: GameState): void {
  s.daySnapshot = {
    at: s.now,
    bossPct: bossPct(s),
    bossNumber: s.battle.boss?.number ?? 0,
    castlePct: s.battle.castleHp / castleMaxHp(s),
    donated: s.stats.donated,
    questions: s.stats.questions,
  };
}
