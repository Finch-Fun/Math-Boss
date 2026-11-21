import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TUNING, TUNING } from '../game/constants';
import { PHASES, runScenario, summarize } from './balanceSim';

const base = { students: 10, donatePct: 0.25, seed: 1, weeks: 3 };

test('the simulator is deterministic', () => {
  assert.deepEqual(runScenario(base), runScenario(base));
});

test('every hour of the week is accounted for', () => {
  for (const r of runScenario(base)) {
    const total = PHASES.reduce((sum, p) => sum + r.hours[p], 0);
    assert.ok(Math.abs(total - r.lengthHours) < 0.01, `${total} vs ${r.lengthHours}`);
    assert.equal(r.lengthHours, 168);
  }
});

test('results stay within valid ranges', () => {
  for (const r of runScenario({ ...base, students: 25, weeks: 4 })) {
    assert.ok(r.castleEndPct >= 0 && r.castleEndPct <= 1 + 1e-9);
    assert.ok(r.castleMinPct >= 0 && r.castleMinPct <= 1 + 1e-9);
    assert.ok(r.bosses >= 0 && r.breaches >= 0 && r.donated <= r.earned + 1);
    assert.ok(r.breachRecoveryHours.length <= r.breaches);
    assert.equal(r.bossTrace.filter((t) => t.defeatedHour !== null).length, r.bosses);
  }
});

test('tuning overrides apply during a run and are always restored afterwards', () => {
  const [week] = runScenario({ ...base, students: 25, weeks: 1, tuning: { castleHpPerStudent: 1000 } });
  assert.equal(week.castleMaxHpBase, 25_000);
  assert.deepEqual({ ...TUNING }, { ...DEFAULT_TUNING });
  const [normal] = runScenario({ ...base, students: 25, weeks: 1 });
  assert.equal(normal.castleMaxHpBase, 10_000);
});

test('a tougher castle means fewer breaches (the simulator responds to tuning)', () => {
  const weak = summarize(runScenario({ ...base, students: 25, donatePct: 0, weeks: 6, tuning: { castleHpPerStudent: 150 } }));
  const strong = summarize(runScenario({ ...base, students: 25, donatePct: 0, weeks: 6, tuning: { castleHpPerStudent: 1500 } }));
  assert.ok(weak.breachesPerWeek > strong.breachesPerWeek);
});
