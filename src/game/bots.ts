// Simulated classmates: deterministic, so a given classroom always behaves the same way.
import { coinsForAttempts } from './actions';
import { activate, castleMaxHp, emergencyRepairFromQuestion, weeklyUnlocked } from './core';
import { currentProjectCost, donate, isProjectMaxed } from './projects';
import { rngFor } from './rng';
import { addDays, dayIndexAbs, dayStart, weekdayIndex } from './time';
import { DAY } from './constants';
import { applyUpgradePurchase, bestUpgrade, isMaxed, upgradeCost } from './upgrades';
import type { GameState, ProjectKey, Student, UpgradeKey } from './types';

function nextSessionAfter(minute: number, after: number): number {
  const base = dayStart(after);
  for (let i = 0; i < 10; i++) {
    const day = addDays(base, i);
    if (weekdayIndex(day) > 4) continue; // school days only
    const t = day + minute * 60_000;
    if (t > after) return t;
  }
  return after + DAY;
}

export function nextBotSession(s: GameState): { time: number; index: number } | null {
  if (!s.dev.botsEnabled) return null;
  let best: { time: number; index: number } | null = null;
  s.students.forEach((st, index) => {
    if (st.id === s.playerId) return; // the human controls this student
    const time = nextSessionAfter(st.bot.sessionMinute, st.bot.lastSessionAt);
    if (best === null || time < best.time) best = { time, index };
  });
  return best;
}

function chooseProject(s: GameState): ProjectKey {
  if (s.battle.phase === 'breach' || s.battle.castleHp < 0.6 * castleMaxHp(s)) return 'repairs';
  const options = (['banner', 'plating', 'walls'] as ProjectKey[])
    .filter((k) => !isProjectMaxed(s, k))
    .sort((a, b) => s.projects[a].level - s.projects[b].level);
  return options[0] ?? 'repairs';
}

function botDonate(s: GameState, st: Student, budget: number): void {
  for (let i = 0; i < 6 && budget > 0 && st.coins > 0; i++) {
    const key = chooseProject(s);
    const remaining = currentProjectCost(s, key) - s.projects[key].funded;
    const amount = Math.min(budget, st.coins, remaining);
    if (amount < 1) return;
    const r = donate(s, st.id, key, amount);
    if (!r.ok) return;
    budget -= amount;
  }
}

function spendOnUpgrades(st: Student): void {
  const strategy = st.bot.strategy;
  for (let guard = 0; guard < 500; guard++) {
    const spendable = strategy === 'saver' ? (st.coins >= 300 ? st.coins - 150 : 0) : st.coins;
    let key: UpgradeKey | null;
    if (strategy === 'damage') {
      key = upgradeCost('damage', st.upgrades.damage) <= spendable ? 'damage' : null;
    } else if (strategy === 'crit') {
      const options = (['critChance', 'critDamage'] as UpgradeKey[])
        .filter((k) => !isMaxed(st.upgrades, k))
        .sort((a, b) => st.upgrades[a] - st.upgrades[b]);
      const pick: UpgradeKey = options[0] ?? 'damage';
      key = upgradeCost(pick, st.upgrades[pick]) <= spendable ? pick : null;
    } else {
      key = bestUpgrade(st.upgrades, spendable);
    }
    if (!key || !applyUpgradePurchase(st, key)) break;
  }
}

export function runBotSession(s: GameState, st: Student, sessionTime: number): void {
  const bot = st.bot;
  bot.lastSessionAt = sessionTime;
  const rng = rngFor(st.id, 'session', dayIndexAbs(sessionTime));
  if (rng() > bot.engagement) return; // absent today; unfinished assignments stay available
  const outstanding = weeklyUnlocked(s) - st.weekQuestions;
  let earned = 0;
  for (let i = 0; i < outstanding; i++) {
    let attempts = 1;
    if (rng() > bot.accuracy) attempts = rng() < Math.min(0.9, bot.accuracy + 0.15) ? 2 : 3;
    earned += coinsForAttempts(attempts);
    st.weekQuestions += 1;
    if (attempts === 1) st.weekFirstTry += 1;
    s.stats.questions += 1;
    emergencyRepairFromQuestion(s);
  }
  if (outstanding > 0) {
    st.coins += earned;
    st.lifetimeCoins += earned;
    activate(s, st);
  }
  if (bot.donatePct > 0 && earned > 0) botDonate(s, st, Math.floor(earned * bot.donatePct));
  spendOnUpgrades(st);
}
