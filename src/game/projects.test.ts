import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armorPct, castleMaxHp, classDps, dpsBonus, getStudent } from './core';
import { devActivateAll, devGrantCoins } from './dev';
import { currentProjectCost, donate, isProjectMaxed, projectCost } from './projects';
import { makeGame } from './testing';

test('project prices match the design for a 25-student class and scale with class size', () => {
  assert.deepEqual(
    (['walls', 'plating', 'banner', 'repairs'] as const).map((k) => projectCost(k, 0, 25)),
    [400, 450, 500, 250],
  );
  assert.equal(projectCost('walls', 0, 10), 160);
  assert.equal(projectCost('walls', 0, 40), 640);
  assert.equal(projectCost('repairs', 1, 25), 375); // repeat purchases cost x1.5
});

test('donations deduct coins immediately and funding is shared', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 150);
  devGrantCoins(s, 's2', 150);
  assert.ok(donate(s, 's1', 'walls', 100).ok);
  assert.ok(donate(s, 's2', 'walls', 100).ok);
  assert.equal(getStudent(s, 's1').coins, 50);
  assert.equal(s.projects.walls.funded, 200);
  assert.equal(s.projects.walls.level, 0);
  assert.equal(s.stats.donated, 200);
});

test('a funded project activates automatically and excess is never charged', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 1000);
  const r = donate(s, 's1', 'walls', 1000);
  assert.ok(r.ok && r.charged === 400 && r.completed);
  assert.equal(getStudent(s, 's1').coins, 600);
  assert.equal(s.projects.walls.level, 1);
  assert.equal(s.projects.walls.funded, 0);
  assert.equal(castleMaxHp(s), 11_000);
  assert.equal(s.battle.castleHp, 11_000); // walls add HP as well as capacity
  assert.equal(currentProjectCost(s, 'walls'), 600);
});

test('invalid donations are rejected without changing balances', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 50);
  assert.equal(donate(s, 's1', 'walls', 51).ok, false);
  assert.equal(donate(s, 's1', 'walls', 0).ok, false);
  assert.equal(donate(s, 's1', 'walls', -5).ok, false);
  assert.equal(donate(s, 's1', 'walls', 2.5).ok, false);
  assert.equal(getStudent(s, 's1').coins, 50);
  assert.equal(s.projects.walls.funded, 0);
});

test('armor caps at 50% and Battle Banner at +25%', () => {
  const s = makeGame();
  devActivateAll(s);
  s.projects.plating.level = 10;
  s.projects.banner.level = 5;
  assert.equal(armorPct(s), 0.5);
  assert.ok(isProjectMaxed(s, 'plating') && isProjectMaxed(s, 'banner'));
  devGrantCoins(s, 's1', 100_000);
  assert.equal(donate(s, 's1', 'plating', 10).ok, false);
  assert.equal(dpsBonus(s), 0.25);
  const base = makeGame();
  devActivateAll(base);
  assert.ok(Math.abs(classDps(s) / classDps(base) - 1.25) < 1e-9);
});

test('Castle Repairs never exceed max HP and stay repeatable', () => {
  const s = makeGame();
  devGrantCoins(s, 's1', 5000);
  s.battle.castleHp = 9500;
  assert.ok(donate(s, 's1', 'repairs', 250).ok);
  assert.equal(s.battle.castleHp, 10_000);
  assert.equal(isProjectMaxed(s, 'repairs'), false);
  assert.equal(s.projects.repairs.level, 1);
});
