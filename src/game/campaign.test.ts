import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from './constants';
import { advance } from './engine';
import { activate } from './core';
import { castleMax, classDpsOf, beginWeek, newCampaign, settleCampaign, changeStudentDps, personalDps, type CampaignState, type RosterEntry, type SettleContext } from './campaign';
import { weekEndZ, weekStartZ } from './zoned';
import { createGame } from './sample';
import { defaultSettings } from './sample';

const TZ = 'America/Chicago';
const MON = Date.UTC(2026, 0, 5, 6, 0, 0); // Monday 00:00 CST
const ctx = (zero = false): SettleContext => ({ timeZone: TZ, settings: { ...defaultSettings(), dailyQuestions: zero ? [0, 0, 0, 0, 0, 0, 0] : [10, 10, 10, 10, 10, 0, 0] } });
const roster = (n: number): RosterEntry[] => Array.from({ length: n }, (_, i) => ({ uid: `s${i}`, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, coins: 0 }));

function start(n = 25, at = MON, zero = false): { c: CampaignState; r: RosterEntry[] } {
  const r = roster(n);
  const c = newCampaign(at, TZ);
  beginWeek(c, at, c.weekStart, ctx(zero), r);
  return { c, r };
}
const activateAll = (c: CampaignState, r: RosterEntry[], at: number, k = r.length) => {
  for (let i = 0; i < k; i++) changeStudentDps(c, 0, personalDps(r[i].upgrades), true, at);
};

describe('campaign settlement', () => {
  it('starts a week with the approved castle and boss values', () => {
    const { c } = start(25);
    assert.equal(c.weekIndex, 1);
    assert.equal(castleMax(c), 10_000);
    assert.equal(c.boss!.attackPerHour, 120);
    assert.equal(c.phase, 'combat');
    assert.equal(c.nextAttackAt, null);
  });

  it('matches the local engine for a constant-DPS span (aggregate == per-student)', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON, 10);
    const g = createGame({ now: MON, studentCount: 25, botsEnabled: false });
    g.battle.boss = { ...c.boss! };
    for (let i = 0; i < 10; i++) activate(g, g.students[i]);
    for (const h of [3.5, 20.25, 51.1]) {
      advance(g, MON + h * HOUR);
      settleCampaign(c, MON + h * HOUR, ctx(), { roster: r });
      assert.ok(Math.abs(g.battle.boss!.hp - c.boss!.hp) < 1e-6, `boss hp at ${h}h`);
      assert.ok(Math.abs(g.battle.castleHp - c.castleHp) < 1e-6, `castle at ${h}h`);
      assert.equal(g.battle.phase, c.phase);
      assert.equal(g.battle.bossesDefeated, c.bossesDefeated);
    }
  });

  it('is split-invariant: settling in many steps equals one step (no double counting)', () => {
    const a = start(25);
    const b = start(25);
    activateAll(a.c, a.r, MON, 12);
    activateAll(b.c, b.r, MON, 12);
    const end = MON + 90 * HOUR;
    settleCampaign(a.c, end, ctx(), { roster: a.r });
    for (let t = MON + 7 * HOUR; t < end; t += 7.3 * HOUR) settleCampaign(b.c, Math.min(t, end), ctx(), { roster: b.r });
    settleCampaign(b.c, end, ctx(), { roster: b.r });
    assert.ok(Math.abs(a.c.boss!.hp - b.c.boss!.hp) < 1e-6);
    assert.equal(a.c.castleHp, b.c.castleHp);
    assert.equal(a.c.bossesDefeated, b.c.bossesDefeated);
    assert.equal(a.c.phase, b.c.phase);
  });

  it('settling to a time in the past is a no-op', () => {
    const { c, r } = start(10);
    activateAll(c, r, MON);
    settleCampaign(c, MON + 5 * HOUR, ctx(), { roster: r });
    const snap = JSON.stringify(c);
    settleCampaign(c, MON + 2 * HOUR, ctx(), { roster: r });
    assert.equal(JSON.stringify(c), snap);
  });

  it('boss defeat starts a 24h preparation, then the next boss appears', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON);
    c.boss!.hp = c.boss!.maxHp = 200_000; // weak boss so the class can win inside the castle's survival window
    const killAt = MON + Math.ceil((c.boss!.hp / classDpsOf(c)) * 1000);
    settleCampaign(c, killAt + 1000, ctx(), { roster: r });
    assert.equal(c.phase, 'training');
    assert.equal(c.bossesDefeated, 1);
    assert.equal(c.nextAttackAt, null);
    settleCampaign(c, killAt + 23 * HOUR, ctx(), { roster: r });
    assert.equal(c.phase, 'training');
    settleCampaign(c, killAt + 25 * HOUR, ctx(), { roster: r });
    assert.equal(c.phase, 'combat');
    assert.equal(c.boss!.number, 2);
  });

  it('no new boss during the final 30 hours', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON);
    c.phase = 'training';
    c.trainingEndsAt = c.weekEnd - 29 * HOUR;
    c.boss!.hp = 0;
    settleCampaign(c, c.weekEnd - 20 * HOUR, ctx(), { roster: r });
    assert.equal(c.phase, 'idle');
  });

  it('breach pauses attacks, recovers automatically, and resumes at 25%', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON, 1); // a single weak student cannot kill the boss; castle falls
    c.boss!.maxHp = c.boss!.hp = 1e12;
    settleCampaign(c, MON + 85 * HOUR, ctx(), { roster: r });
    assert.equal(c.phase, 'breach');
    assert.equal(c.stats.breaches, 1);
    const hpAtBreach = c.castleHp;
    assert.equal(c.nextAttackAt, null);
    settleCampaign(c, MON + 120 * HOUR, ctx(), { roster: r });
    assert.ok(c.castleHp > hpAtBreach || (c.phase as string) === 'combat');
    settleCampaign(c, MON + 134.5 * HOUR, ctx(), { roster: r });
    assert.equal(c.phase, 'combat');
    assert.ok(c.castleHp >= 0.25 * castleMax(c) - 1);
  });

  it('rolls over at Monday 12:00 AM local across the spring DST change (167h week)', () => {
    const sun = Date.UTC(2026, 2, 2, 6, 0, 0); // Monday Mar 2 00:00 CST
    const { c, r } = start(25, sun);
    assert.equal(c.weekEnd - c.weekStart, 167 * HOUR);
    activateAll(c, r, sun, 3);
    settleCampaign(c, c.weekEnd - 1, ctx(), { roster: r });
    assert.equal(c.weekIndex, 1);
    settleCampaign(c, c.weekEnd, ctx(), { roster: r });
    assert.equal(c.weekIndex, 2);
    assert.equal(c.weekStart, Date.UTC(2026, 2, 9, 5, 0, 0)); // 00:00 CDT
    assert.equal(c.activatedCount, 0);
    assert.equal(c.history.length, 1);
  });

  it('rolls over across the fall DST change (169h week)', () => {
    const mon = weekStartZ(Date.UTC(2026, 10, 1, 12), TZ);
    const { c, r } = start(25, mon);
    assert.equal(c.weekEnd - c.weekStart, 169 * HOUR);
    settleCampaign(c, c.weekEnd + 1, ctx(), { roster: r });
    assert.equal(c.weekIndex, 2);
    assert.equal(c.weekStart, weekEndZ(mon, TZ));
  });

  it('week boundaries follow the classroom zone, not UTC', () => {
    const t = Date.UTC(2026, 0, 5, 3, 0, 0); // Mon 03:00 UTC = still Sunday evening in Chicago, Monday noon in Auckland
    assert.equal(weekStartZ(t, 'America/Chicago'), Date.UTC(2025, 11, 29, 6, 0, 0));
    assert.equal(weekStartZ(t, 'Pacific/Auckland'), Date.UTC(2026, 0, 4, 11, 0, 0));
  });

  it('is bounded after a very long absence (skips old weeks, still finishes quickly)', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON);
    const t0 = Date.now();
    const res = settleCampaign(c, MON + 200 * 7 * 24 * HOUR, ctx(), { roster: r });
    assert.ok(Date.now() - t0 < 2000);
    assert.ok(res.skippedWeeks > 180);
    assert.ok(c.weekIndex >= 200);
    assert.ok(c.weekEnd > MON + 200 * 7 * 24 * HOUR);
  });

  it('zero-question weeks auto-activate every student and start the attack clock', () => {
    const { c } = start(10, MON, true);
    assert.equal(c.activatedCount, 10);
    assert.ok(c.dpsSum > 0);
    assert.equal(c.nextAttackAt, MON + HOUR);
  });

  it('the accumulator recovers each student\'s damage', () => {
    const { c, r } = start(25);
    activateAll(c, r, MON, 4);
    const acc0 = c.acc;
    settleCampaign(c, MON + 2 * HOUR, ctx(), { roster: r });
    const mine = personalDps(r[0].upgrades) * (c.acc - acc0);
    const expected = (classDpsOf(c) * 2 * 3600) / 4;
    assert.ok(Math.abs(mine - expected) < 1e-6);
  });
});
