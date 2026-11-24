import {
  BOSS_DIFFICULTY_MOD,
  BOSS_NAMES,
  DEFAULT_EXPECTED_PARTICIPATION,
  EXPECTED_COINS_PER_QUESTION,
  PERSONAL_SPEND_SHARE,
  REFERENCE_CLASS_SIZE,
  TUNING,
} from './constants';
import { bestUpgrade, dps, upgradeCost } from './upgrades';
import type { Boss, GameState, Upgrades } from './types';

/** The few fields boss calibration reads, so the trusted server can supply them without building a whole GameState. */
export interface BossInputs {
  now: number;
  students: { upgrades: Upgrades; coins: number }[];
  settings: Pick<GameState['settings'], 'dailyQuestions' | 'bossDifficulty'>;
  history: { activatedFraction: number }[];
}

export const bossName = (number: number): string =>
  number <= BOSS_NAMES.length ? BOSS_NAMES[number - 1] : `${BOSS_NAMES[(number - 1) % BOSS_NAMES.length]} (Stage ${number})`;

/** Coins a student is expected to put toward personal upgrades this week. */
export function expectedWeeklyCoinsPerStudent(s: BossInputs): number {
  const questions = s.settings.dailyQuestions.reduce((a, b) => a + b, 0);
  return questions * EXPECTED_COINS_PER_QUESTION * PERSONAL_SPEND_SHARE;
}

/** Recent participation = average share of students activated over the last four weeks. */
export function expectedParticipation(s: BossInputs): number {
  const recent = s.history.slice(0, 4);
  if (!recent.length) return DEFAULT_EXPECTED_PARTICIPATION;
  const avg = recent.reduce((sum, w) => sum + w.activatedFraction, 0) / recent.length;
  return Math.min(1, Math.max(0.25, avg));
}

/** DPS after greedily spending `budget` coins on the most efficient upgrades. */
export function projectedDps(u: Upgrades, budget: number): number {
  let up = { ...u };
  let coins = budget;
  for (let i = 0; i < 500; i++) {
    const key = bestUpgrade(up, coins);
    if (!key) break;
    coins -= upgradeCost(key, up[key]);
    up = { ...up, [key]: up[key] + 1 };
  }
  return dps(up);
}

/**
 * Expected class DPS: each student's DPS averaged between "now" and the end of the week after spending
 * their expected earnings, scaled by recent participation. Larger classes get proportionally larger bosses.
 */
export function expectedClassDps(s: BossInputs): number {
  const budget = expectedWeeklyCoinsPerStudent(s);
  let total = 0;
  for (const st of s.students) {
    total += (dps(st.upgrades) + projectedDps(st.upgrades, budget + st.coins)) / 2;
  }
  return total * expectedParticipation(s);
}

/** Boss HP = Expected Class DPS x Target Combat Seconds x Difficulty Modifier x stage multiplier. Fixed at spawn. */
export function bossMaxHp(s: BossInputs, number: number): number {
  return Math.round(
    expectedClassDps(s) * (TUNING.bossTargetHours * 3600) * BOSS_DIFFICULTY_MOD[s.settings.bossDifficulty] * TUNING.bossHpGrowth ** (number - 1),
  );
}

/** 120 HP/hour for a 25-student class, scaled linearly by class size (assumption), x1.2 per stage. */
export function bossAttackPerHour(studentCount: number, number: number): number {
  const base = (TUNING.bossAttackPerHourRef * studentCount) / REFERENCE_CLASS_SIZE;
  return Math.round(base * TUNING.bossAttackGrowth ** (number - 1) * 100) / 100;
}

export function spawnBoss(s: BossInputs, number: number): Boss {
  const maxHp = bossMaxHp(s, number);
  return {
    number,
    name: bossName(number),
    maxHp,
    hp: maxHp,
    attackPerHour: bossAttackPerHour(s.students.length, number),
    spawnedAt: s.now,
  };
}
