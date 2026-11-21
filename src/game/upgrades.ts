import { UPGRADE_DEFS, UPGRADE_KEYS } from './constants';
import type { Student, UpgradeKey, Upgrades } from './types';

export const emptyUpgrades = (): Upgrades => ({ damage: 0, speed: 0, critChance: 0, critDamage: 0 });

/** Next Cost = ceil(Base x Growth^Level), computed exactly with integers. */
export function upgradeCost(key: UpgradeKey, level: number): number {
  const d = UPGRADE_DEFS[key];
  const [n, m] = d.growth;
  const num = BigInt(d.baseCost) * BigInt(n) ** BigInt(level);
  const den = BigInt(m) ** BigInt(level);
  return Number((num + den - 1n) / den);
}

export function isMaxed(u: Upgrades, key: UpgradeKey): boolean {
  const max = UPGRADE_DEFS[key].maxLevel;
  return max !== null && u[key] >= max;
}

export interface CharacterStats {
  damage: number;
  attacksPerSecond: number;
  critChance: number;
  critMultiplier: number;
}

export function characterStats(u: Upgrades): CharacterStats {
  return {
    damage: 1 + u.damage,
    attacksPerSecond: (20 + u.speed) / 20,
    critChance: Math.min(40, 5 + u.critChance) / 100,
    critMultiplier: Math.min(30, 15 + u.critDamage) / 10,
  };
}

/** DPS = Damage x Attacks/sec x [1 + CritChance x (CritMultiplier - 1)] */
export function dps(u: Upgrades): number {
  const s = characterStats(u);
  return s.damage * s.attacksPerSecond * (1 + s.critChance * (s.critMultiplier - 1));
}

/** Most DPS per coin among affordable upgrades; used by classmates and boss calibration. */
export function bestUpgrade(u: Upgrades, coins: number): UpgradeKey | null {
  const base = dps(u);
  let best: UpgradeKey | null = null;
  let bestRatio = -1;
  for (const key of UPGRADE_KEYS) {
    if (isMaxed(u, key)) continue;
    const cost = upgradeCost(key, u[key]);
    if (cost > coins) continue;
    const ratio = (dps({ ...u, [key]: u[key] + 1 }) - base) / cost;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = key;
    }
  }
  return best;
}

/** Transaction only: callers validate. Never lets coins go negative. */
export function applyUpgradePurchase(st: Student, key: UpgradeKey): boolean {
  if (isMaxed(st.upgrades, key)) return false;
  const cost = upgradeCost(key, st.upgrades[key]);
  if (st.coins < cost) return false;
  st.coins -= cost;
  st.upgrades[key] += 1;
  return true;
}
