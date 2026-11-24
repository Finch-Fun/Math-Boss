import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from '../game/constants';
import { beginWeek, changeStudentDps, newCampaign, personalDps, settleCampaign } from '../game/campaign';
import { defaultSettings } from '../game/sample';
import { describePhase } from '../game/report';
import { campaignAsGameState, etaToDefeat, projectCampaign, viewOfPlayer } from './liveState';

const TZ = 'America/Chicago';
const MON = Date.UTC(2026, 0, 5, 6);
const ctx = { timeZone: TZ, settings: defaultSettings() };
const roster = Array.from({ length: 10 }, (_, i) => ({ uid: `s${i}`, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, coins: 0 }));
function campaign() {
  const c = newCampaign(MON, TZ);
  beginWeek(c, MON, c.weekStart, ctx, roster);
  for (let i = 0; i < 3; i++) changeStudentDps(c, 0, personalDps(roster[i].upgrades), true, MON);
  return c;
}

describe('live projection', () => {
  it('estimates boss HP between server updates exactly as the server will settle it', () => {
    const c = campaign();
    const p = projectCampaign(c, MON + 5 * HOUR, ctx);
    const real = structuredClone(c);
    settleCampaign(real, MON + 5 * HOUR, ctx, { roster });
    assert.equal(p.state.boss!.hp, real.boss!.hp);
    assert.equal(p.state.castleHp, real.castleHp);
    assert.equal(c.boss!.hp, c.boss!.maxHp, 'projection never mutates the authoritative state');
    assert.equal(p.needsServer, false);
  });

  it('stops and asks the server when a new week or boss needs the roster', () => {
    const c = campaign();
    const p = projectCampaign(c, c.weekEnd + HOUR, ctx);
    assert.equal(p.needsServer, true);
    assert.equal(p.state.weekIndex, c.weekIndex);
  });

  it('derives the same phase text and ETA from shared state alone', () => {
    const c = campaign();
    const gs = campaignAsGameState(c, MON + HOUR, 'Room', defaultSettings());
    assert.equal(describePhase(gs).tone, 'combat');
    assert.ok(etaToDefeat(c)! > 0);
  });

  it("derives a student's view from their own document", () => {
    const c = campaign();
    settleCampaign(c, MON + 2 * HOUR, ctx, { roster });
    const dps = personalDps(roster[0].upgrades);
    const view = viewOfPlayer(
      { uid: 's0', nickname: 'A', coins: 12, lifetimeCoins: 12, upgrades: roster[0].upgrades, week: { index: 1, activated: true, accAt: 0, dps, damage: 0, donated: 0, questions: 1, firstTry: 1, currentWrong: 0, bonus: {} } },
      c,
      ctx,
      MON + 2 * HOUR,
    );
    assert.equal(view.activated, true);
    assert.ok(Math.abs(view.weekDamage - dps * 2 * 3600) < 1e-6);
    assert.equal(view.dailyUnlocked, 10);
    assert.equal(view.dailyRemaining, 9);
    // a document from last week shows as inactive with no weekly progress
    const stale = viewOfPlayer({ uid: 's0', nickname: 'A', coins: 3, lifetimeCoins: 3, upgrades: roster[0].upgrades, week: { index: 0, activated: true, accAt: 0, dps, damage: 5, donated: 9, questions: 4, firstTry: 1, currentWrong: 0, bonus: {} } }, c, ctx, MON);
    assert.equal(stale.activated, false);
    assert.equal(stale.weekDonated, 0);
    assert.equal(stale.coins, 3);
  });
});
