import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchaseUpgrade, updateSettings } from './actions';
import { getStudent } from './core';
import { devGrantCoins } from './dev';
import { makeGame } from './testing';
import { characterStats, dps, emptyUpgrades, isMaxed, upgradeCost } from './upgrades';

test('upgrade costs follow ceil(base x growth^level) exactly', () => {
  assert.deepEqual([0, 1, 2, 3].map((l) => upgradeCost('damage', l)), [10, 12, 14, 16]);
  assert.deepEqual([0, 1].map((l) => upgradeCost('speed', l)), [25, 30]);
  // 40 x 1.2 and 50 x 1.18 are exact integers; floating point would round them up a coin
  assert.equal(upgradeCost('critChance', 0), 40);
  assert.equal(upgradeCost('critChance', 1), 48);
  assert.equal(upgradeCost('critDamage', 0), 50);
  assert.equal(upgradeCost('critDamage', 1), 59);
});

test('upgrade prices never decrease', () => {
  for (const key of ['damage', 'speed', 'critChance', 'critDamage'] as const) {
    for (let level = 0; level < 60; level++) assert.ok(upgradeCost(key, level + 1) >= upgradeCost(key, level));
  }
});

test('base character matches the design document', () => {
  const stats = characterStats(emptyUpgrades());
  assert.deepEqual(stats, { damage: 1, attacksPerSecond: 1, critChance: 0.05, critMultiplier: 1.5 });
  assert.ok(Math.abs(dps(emptyUpgrades()) - 1.025) < 1e-12);
});

test('DPS = damage x attacks/sec x (1 + crit chance x (crit multiplier - 1))', () => {
  const u = { damage: 4, speed: 2, critChance: 10, critDamage: 5 };
  // 5 x 1.1 x (1 + 0.15 x 1.0) = 6.325
  assert.ok(Math.abs(dps(u) - 6.325) < 1e-9);
});

test('critical chance caps at 40% and critical damage at 3.0x', () => {
  const u = { damage: 0, speed: 0, critChance: 35, critDamage: 15 };
  assert.equal(characterStats(u).critChance, 0.4);
  assert.equal(characterStats(u).critMultiplier, 3);
  assert.ok(isMaxed(u, 'critChance') && isMaxed(u, 'critDamage'));
  assert.ok(!isMaxed(u, 'damage') && !isMaxed(u, 'speed'));
});

test('purchase deducts the price, raises the level and raises DPS', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 100);
  const before = dps(getStudent(s, 's1').upgrades);
  const result = purchaseUpgrade(s, 's1', 'damage');
  assert.equal(result.ok, true);
  const st = getStudent(s, 's1');
  assert.equal(st.coins, 90);
  assert.equal(st.upgrades.damage, 1);
  assert.ok(dps(st.upgrades) > before);
  assert.equal(upgradeCost('damage', st.upgrades.damage), 12); // price rises
});

test('purchases fail without enough coins and never create a negative balance', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 5);
  const result = purchaseUpgrade(s, 's1', 'damage');
  assert.equal(result.ok, false);
  assert.equal(getStudent(s, 's1').coins, 5);
  assert.equal(getStudent(s, 's1').upgrades.damage, 0);
});

test('maxed upgrades cannot be purchased', () => {
  const s = makeGame();
  const st = getStudent(s, 's1');
  st.upgrades.critChance = 35;
  st.coins = 1_000_000;
  const result = purchaseUpgrade(s, 's1', 'critChance');
  assert.equal(result.ok, false);
  assert.equal(st.coins, 1_000_000);
});

test('Require Math for Upgrades validates the remaining balance independently of the UI', () => {
  const s = makeGame();
  updateSettings(s, { requireMathForUpgrades: true });
  devGrantCoins(s, 's1', 350);
  const st = getStudent(s, 's1');

  const missing = purchaseUpgrade(s, 's1', 'damage');
  assert.equal(missing.ok, false);

  const wrong = purchaseUpgrade(s, 's1', 'damage', { claimedRemaining: 339 });
  assert.equal(wrong.ok, false);
  assert.ok(!wrong.ok && wrong.hint);
  assert.equal(st.coins, 350);
  assert.equal(st.upgrades.damage, 0);

  const right = purchaseUpgrade(s, 's1', 'damage', { claimedRemaining: 340 });
  assert.equal(right.ok, true);
  assert.equal(st.coins, 340);
});

test('with the setting off, no calculation is required', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 50);
  assert.equal(purchaseUpgrade(s, 's1', 'damage').ok, true);
});
