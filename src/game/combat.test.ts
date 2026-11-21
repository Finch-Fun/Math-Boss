import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitDailyAnswer } from './actions';
import { bossAttackPerHour, bossMaxHp } from './boss';
import { DEFAULT_TUNING, HOUR, resetTuning, setTuning, TUNING } from './constants';
import { castleMaxHp, classDps, getStudent } from './core';
import { devActivateAll, devGrantCoins } from './dev';
import { advance } from './engine';
import { donate } from './projects';
import { answerFor, hours, makeGame } from './testing';
import { upgradeCost } from './upgrades';

const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test('castle HP is 400 per student and Boss 1 hits a 25-student castle for 110/hour', () => {
  const s = makeGame();
  assert.equal(castleMaxHp(s), 10_000);
  assert.equal(s.battle.boss!.attackPerHour, 110);
  assert.equal(bossAttackPerHour(25, 2), 132);
});

test('boss HP grows 1.5x per stage', () => {
  const s = makeGame();
  const b1 = bossMaxHp(s, 1);
  near(bossMaxHp(s, 2), b1 * 1.5, 1e-6);
  near(bossMaxHp(s, 3), b1 * 2.25, 1e-6);
  near(bossMaxHp(s, 5), b1 * 5.0625, 1e-6);
});

test('boss HP scales with classroom size', () => {
  const small = makeGame({ students: 10 });
  const large = makeGame({ students: 40 });
  near(small.battle.boss!.maxHp / 10, large.battle.boss!.maxHp / 40, 1e-6);
  assert.equal(castleMaxHp(small), 4000);
  assert.equal(castleMaxHp(large), 16_000);
});

test('boss difficulty modifies HP (easy 0.75x, hard 1.3x)', () => {
  const s = makeGame();
  const normal = bossMaxHp(s, 1);
  s.settings.bossDifficulty = 'easy';
  near(bossMaxHp(s, 1), normal * 0.75, 1e-6);
  s.settings.bossDifficulty = 'hard';
  near(bossMaxHp(s, 1), normal * 1.3, 1e-6);
});

test('inactive students deal no damage and the boss does not attack before anyone activates', () => {
  const s = makeGame();
  const boss = s.battle.boss!;
  advance(s, s.now + hours(10));
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(s.battle.castleHp, 10_000);
  assert.equal(s.battle.nextAttackAt, null);
});

test('the first correct answer starts the boss attack clock', () => {
  const s = makeGame();
  advance(s, s.now + hours(5));
  submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.equal(s.battle.nextAttackAt, s.now + HOUR);
  advance(s, s.now + HOUR);
  assert.equal(s.battle.castleHp, 10_000 - 110);
});

test('idle damage equals class DPS x elapsed time', () => {
  const s = makeGame();
  devActivateAll(s);
  const boss = s.battle.boss!;
  const dps = classDps(s);
  near(dps, 25 * 1.025, 1e-9);
  advance(s, s.now + 30 * 60_000);
  near(boss.maxHp - boss.hp, dps * 1800, 1e-9);
  near(getStudent(s, 's1').weekDamage, 1.025 * 1800, 1e-9);
});

test('boss defeat starts a 24-hour training period, then a stronger boss appears', () => {
  const s = makeGame();
  devActivateAll(s);
  const boss1 = s.battle.boss!;
  const stage1Hp = boss1.maxHp;
  boss1.hp = classDps(s) * 3600; // dies in about an hour
  const start = s.now;
  advance(s, start + HOUR + 5000);
  assert.equal(s.battle.phase, 'training');
  assert.equal(s.battle.bossesDefeated, 1);
  const castleAfterVictory = s.battle.castleHp;
  assert.ok(castleAfterVictory >= 10_000 - 110);
  const damageAtVictory = getStudent(s, 's1').weekDamage;

  advance(s, start + hours(13)); // mid-training: nothing attacks, nothing is damaged
  assert.equal(s.battle.phase, 'training');
  assert.equal(s.battle.castleHp, castleAfterVictory);
  assert.equal(getStudent(s, 's1').weekDamage, damageAtVictory);

  advance(s, start + hours(25) + 2000); // training lasts 24h after the defeat (at about +1h)
  assert.equal(s.battle.phase, 'combat');
  const boss2 = s.battle.boss!;
  assert.equal(boss2.number, 2);
  assert.equal(boss2.attackPerHour, 132);
  assert.ok(boss2.maxHp - boss2.hp < 100); // only about a second of fighting so far
  assert.ok(Math.abs(boss2.maxHp - stage1Hp * 1.5) <= 2);
  assert.equal(s.battle.bossesDefeated, 1);
});

test('students can still buy upgrades and train during the training period', () => {
  const s = makeGame();
  devActivateAll(s);
  s.battle.boss!.hp = 0;
  advance(s, s.now);
  assert.equal(s.battle.phase, 'training');
  assert.ok(submitDailyAnswer(s, 's1', answerFor(s, 's1', true)).ok);
  assert.equal(getStudent(s, 's1').coins, 10);
});

test('boss attacks hit the castle once an hour, reduced by armor', () => {
  const s = makeGame();
  devActivateAll(s);
  advance(s, s.now + hours(3));
  assert.equal(s.battle.castleHp, 10_000 - 3 * 110);

  const armored = makeGame();
  armored.projects.plating.level = 2; // 10% armor
  devActivateAll(armored);
  advance(armored, armored.now + hours(3));
  assert.equal(armored.battle.castleHp, 10_000 - 3 * 99);
});

test('castle breach pauses student damage, then recovers to 25% and combat resumes', () => {
  const s = makeGame();
  devActivateAll(s);
  s.battle.castleHp = 100;
  advance(s, s.now + HOUR);
  assert.equal(s.battle.phase, 'breach');
  assert.equal(s.battle.castleHp, 0);
  assert.equal(s.stats.breaches, 1);

  const hp = s.battle.boss!.hp;
  advance(s, s.now + hours(10));
  assert.equal(s.battle.boss!.hp, hp); // offense is paused
  assert.equal(s.battle.phase, 'breach');
  near(s.battle.castleHp, 500, 1e-3); // slow automatic reconstruction: 0.5% of max per hour

  advance(s, s.now + hours(40.5)); // 50.5 hours after the breach: past the 25% threshold
  assert.equal(s.battle.phase, 'combat');
  assert.ok(s.battle.castleHp >= 2500 - 1e-3);
  assert.ok(s.battle.boss!.hp < hp); // attacking again
});

test('correct Daily Review answers add emergency repair during a breach without extra coins', () => {
  const s = makeGame();
  s.battle.phase = 'breach';
  s.battle.nextAttackAt = null;
  s.battle.castleHp = 0;
  const r = submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.ok(r.ok && r.correct && r.coins === 10);
  near(s.battle.castleHp, 10, 1e-9); // 0.1% of 10,000
  assert.equal(getStudent(s, 's1').coins, 10);
});

test('funding Castle Repairs can end a breach', () => {
  const s = makeGame();
  devActivateAll(s);
  s.battle.phase = 'breach';
  s.battle.nextAttackAt = null;
  s.battle.castleHp = 0;
  devGrantCoins(s, 's1', 5000);
  assert.ok(donate(s, 's1', 'repairs', 250).ok);
  assert.equal(s.battle.castleHp, 2000); // +20% is still below the 25% threshold
  assert.equal(s.battle.phase, 'breach');
  assert.equal(upgradeCost('damage', 0), 10);
  assert.ok(donate(s, 's1', 'repairs', 375).ok); // repeat purchases cost more (x1.5)
  assert.equal(s.battle.castleHp, 4000);
  assert.equal(s.battle.phase, 'combat');
  assert.equal(getStudent(s, 's1').coins, 5000 - 625);
});

test('weekly reset restores the castle and boss but keeps coins and upgrades', () => {
  const s = makeGame();
  devActivateAll(s);
  devGrantCoins(s, 's1', 800);
  const st = getStudent(s, 's1');
  st.upgrades.damage = 3;
  donate(s, 's1', 'walls', 400);
  s.battle.castleHp = 123;
  s.battle.bossesDefeated = 2;
  const coins = st.coins;
  advance(s, s.battle.weekEnd);
  assert.equal(s.battle.weekIndex, 2);
  assert.ok(s.students.every((x) => !x.activated && x.weekDamage === 0));
  assert.equal(s.battle.castleHp, 10_000);
  assert.equal(s.battle.boss!.number, 1);
  assert.equal(s.battle.bossesDefeated, 0);
  assert.equal(s.projects.walls.level, 0);
  assert.equal(st.coins, coins);
  assert.equal(st.upgrades.damage, 3);
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].bossesDefeated, 2);
});

test('no new boss spawns in the final two hours of the campaign', () => {
  const late = makeGame();
  devActivateAll(late);
  late.battle.phase = 'training';
  late.battle.nextAttackAt = null;
  late.battle.bossesDefeated = 1;
  late.battle.boss!.hp = 0;
  late.battle.trainingEndsAt = late.battle.weekEnd - HOUR;
  advance(late, late.battle.weekEnd - 30 * 60_000);
  assert.equal(late.battle.phase, 'idle');
  assert.equal(late.battle.boss!.number, 1);

  const early = makeGame();
  devActivateAll(early);
  early.battle.phase = 'training';
  early.battle.nextAttackAt = null;
  early.battle.bossesDefeated = 1;
  early.battle.boss!.hp = 0;
  early.battle.trainingEndsAt = early.battle.weekEnd - hours(3);
  advance(early, early.battle.weekEnd - hours(2) - 60_000);
  assert.equal(early.battle.phase, 'combat');
  assert.equal(early.battle.boss!.number, 2);
});

test('simulated classmates are deterministic and keep the game state valid over several weeks', () => {
  const a = makeGame({ bots: true });
  const b = makeGame({ bots: true });
  advance(a, a.now + hours(24 * 21));
  advance(b, b.now + hours(24 * 21));
  a.savedAtReal = 0;
  b.savedAtReal = 0;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.battle.weekIndex >= 3);
  assert.ok(a.students.some((st) => st.lifetimeCoins > 0));
  for (const st of a.students) assert.ok(st.coins >= 0 && Number.isFinite(st.weekDamage));
  const max = castleMaxHp(a);
  assert.ok(a.battle.castleHp >= 0 && a.battle.castleHp <= max + 1e-6);
  assert.ok(a.battle.boss!.hp >= 0);
});

test('provisional combat values still match docs/GAME_DESIGN.md (changing them is a design decision)', () => {
  assert.deepEqual(
    { ...DEFAULT_TUNING },
    {
      castleHpPerStudent: 400,
      bossAttackPerHourRef: 110,
      bossAttackGrowth: 1.2,
      bossHpGrowth: 1.5,
      bossTargetHours: 30,
      noSpawnWindowHours: 2,
      breachRecoveryFraction: 0.25,
      autoReconstructionPerHour: 0.005,
      questionRepairFraction: 0.001,
      wallsPerLevel: 0.1,
      armorPerLevel: 0.05,
      repairsFraction: 0.2,
      projectRepeatGrowth: [3, 2],
    },
  );
  assert.deepEqual({ ...TUNING }, { ...DEFAULT_TUNING }); // nothing left overridden by another test
});

test('the spawn cutoff is tunable: a longer cutoff means no new boss late in the week', () => {
  const setup = () => {
    const s = makeGame();
    devActivateAll(s);
    s.battle.phase = 'training';
    s.battle.nextAttackAt = null;
    s.battle.bossesDefeated = 2;
    s.battle.boss!.hp = 0;
    s.battle.trainingEndsAt = s.battle.weekEnd - hours(20); // training ends with 20 hours left
    return s;
  };
  const normal = setup();
  advance(normal, normal.battle.weekEnd - hours(19));
  assert.equal(normal.battle.phase, 'combat'); // default: only the final 2 hours are excluded

  setTuning({ noSpawnWindowHours: 30 });
  try {
    const strict = setup();
    advance(strict, strict.battle.weekEnd - hours(19));
    assert.equal(strict.battle.phase, 'idle');
  } finally {
    resetTuning();
  }
});
