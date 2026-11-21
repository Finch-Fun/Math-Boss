// Player actions. Each validates against authoritative state (never trusts the UI) and mutates the state it is given.
import { BONUS_REWARD, DAILY_REWARDS, MAX_DAILY_QUESTIONS, UPGRADE_DEFS } from './constants';
import { activate, applyZeroWeekRule, emergencyRepairFromQuestion, getStudent, weeklyUnlocked } from './core';
import { bonusQuestionsForWeek, generateDailyQuestion, hintFor, parseAnswer, type Question } from './questions';
import type { GameState, Result, Settings, Student, UpgradeKey } from './types';
import { applyUpgradePurchase, isMaxed, upgradeCost } from './upgrades';

export function coinsForAttempts(attempts: number): number {
  if (attempts <= 1) return DAILY_REWARDS.first;
  if (attempts === 2) return DAILY_REWARDS.second;
  return DAILY_REWARDS.later;
}

export const dailyRemaining = (s: GameState, st: Student): number => Math.max(0, weeklyUnlocked(s) - st.weekQuestions);

export function currentDailyQuestion(s: GameState, st: Student): Question | null {
  if (dailyRemaining(s, st) <= 0) return null;
  return generateDailyQuestion({
    studentId: st.id,
    weekIndex: s.battle.weekIndex,
    index: st.weekQuestions,
    preset: s.settings.difficultyPreset,
    skills: s.settings.skills,
  });
}

export type DailyOutcome = { correct: true; coins: number; attempts: number } | { correct: false; hint: string; wrongCount: number };

export function submitDailyAnswer(s: GameState, studentId: string, raw: string): Result<DailyOutcome> {
  const st = getStudent(s, studentId);
  const q = currentDailyQuestion(s, st);
  if (!q) return { ok: false, reason: 'No Daily Review question is available right now.' };
  const value = parseAnswer(raw);
  if (value === null) return { ok: false, reason: 'Please enter a number.' };
  if (value !== q.answer) {
    st.currentWrong += 1;
    return { ok: true, correct: false, hint: hintFor(q, st.currentWrong) ?? '', wrongCount: st.currentWrong };
  }
  const attempts = st.currentWrong + 1;
  const coins = coinsForAttempts(attempts);
  st.coins += coins;
  st.lifetimeCoins += coins;
  st.weekQuestions += 1;
  if (attempts === 1) st.weekFirstTry += 1;
  st.currentWrong = 0;
  s.stats.questions += 1;
  st.records.push({ week: s.battle.weekIndex, skill: q.skill, difficulty: q.difficulty, firstAttempt: attempts === 1, attempts, coins, at: s.now });
  if (st.records.length > 300) st.records.splice(0, st.records.length - 300);
  activate(s, st); // weekly activation: one correct Daily Review answer
  emergencyRepairFromQuestion(s);
  return { ok: true, correct: true, coins, attempts };
}

export function bonusKey(s: GameState, index: number): string {
  return `${s.battle.weekIndex}:${index}`;
}

/** One attempt only. Correct = 20 coins, incorrect = 0. Locked after submission. */
export function submitBonusAnswer(s: GameState, studentId: string, index: number, choice: number): Result<{ correct: boolean; coins: number }> {
  if (!s.settings.bonusEnabled) return { ok: false, reason: 'Bonus Questions are not available right now.' };
  const st = getStudent(s, studentId);
  const question = bonusQuestionsForWeek(s.battle.weekIndex)[index];
  if (!question) return { ok: false, reason: 'Unknown bonus question.' };
  const key = bonusKey(s, index);
  if (st.bonusAnswers[key]) return { ok: false, reason: 'This question is already answered and locked.' };
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) return { ok: false, reason: 'Pick one of the choices.' };
  const correct = choice === question.correct;
  const coins = correct ? BONUS_REWARD : 0;
  st.bonusAnswers[key] = { choice, correct };
  st.coins += coins;
  st.lifetimeCoins += coins;
  return { ok: true, correct, coins };
}

/**
 * With "Require Math for Upgrades" on, the caller must supply the remaining balance (coins - price).
 * The real balance and price are always validated here, independent of the student's input.
 */
export function purchaseUpgrade(s: GameState, studentId: string, key: UpgradeKey, opts: { claimedRemaining?: number } = {}): Result<{ cost: number }> {
  const st = getStudent(s, studentId);
  if (isMaxed(st.upgrades, key)) return { ok: false, reason: `${UPGRADE_DEFS[key].label} is at its maximum level.` };
  const cost = upgradeCost(key, st.upgrades[key]);
  if (st.coins < cost) return { ok: false, reason: `Not enough coins. You need ${cost - st.coins} more.` };
  if (s.settings.requireMathForUpgrades) {
    if (opts.claimedRemaining === undefined) return { ok: false, reason: 'Enter your remaining balance to complete this purchase.' };
    if (opts.claimedRemaining !== st.coins - cost) {
      return { ok: false, reason: 'That is not quite right.', hint: `Subtract the price from your coins: ${st.coins} − ${cost}. Count back carefully, then try again.` };
    }
  }
  applyUpgradePurchase(st, key);
  return { ok: true, cost };
}

export function updateSettings(s: GameState, patch: Partial<Settings>): void {
  const next: Settings = { ...s.settings, ...patch };
  next.dailyQuestions = Array.from({ length: 7 }, (_, i) => {
    const n = Math.round(Number(next.dailyQuestions[i] ?? 0));
    return Math.min(MAX_DAILY_QUESTIONS, Math.max(0, Number.isFinite(n) ? n : 0));
  });
  s.settings = next;
  applyZeroWeekRule(s);
}
