// Developer testing helpers (time is advanced by the caller via engine.advance).
import { activate, castleMaxHp, getStudent, log } from './core';
import type { GameState } from './types';

export function devGrantCoins(s: GameState, studentId: string, amount: number): void {
  const st = getStudent(s, studentId);
  st.coins += amount;
  st.lifetimeCoins += amount;
}

/** fraction of the boss's max HP left. 0 defeats the boss on the next engine step. */
export function devSetBossHpFraction(s: GameState, fraction: number): void {
  const boss = s.battle.boss;
  if (!boss || s.battle.phase !== 'combat') return;
  boss.hp = Math.max(0, boss.maxHp * fraction);
}

/** Set castle HP as a fraction of max. 0 forces a breach. */
export function devSetCastleFraction(s: GameState, fraction: number): void {
  const b = s.battle;
  b.castleHp = Math.max(0, castleMaxHp(s) * fraction);
  if (b.castleHp <= 0 && b.phase === 'combat') {
    b.phase = 'breach';
    b.nextAttackAt = null;
    s.stats.breaches += 1;
    log(s, '[dev] The castle was forced into a breach.');
  }
}

export function devActivateAll(s: GameState): void {
  for (const st of s.students) activate(s, st);
}

export function devSetDpsMultiplier(s: GameState, multiplier: number): void {
  s.dev.dpsMultiplier = multiplier;
}

export function devSetBots(s: GameState, enabled: boolean): void {
  s.dev.botsEnabled = enabled;
  // Skip any sessions "missed" while bots were off instead of replaying them all at once.
  for (const st of s.students) st.bot.lastSessionAt = Math.max(st.bot.lastSessionAt, s.now);
}

export function switchPlayer(s: GameState, studentId: string): void {
  const previous = getStudent(s, s.playerId);
  previous.bot.lastSessionAt = Math.max(previous.bot.lastSessionAt, s.now);
  getStudent(s, studentId); // validates
  s.playerId = studentId;
}
