import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame } from '../game/sample';
import { newCampaign } from '../game/campaign';
import { CHARACTER_CLASSES, classForUid, hash32, variantForUid } from './classes';
import {
  BOSS_BOX, BOSS_FACING, CASTLE_BOX, CHARACTER_FACING, MAGE_SLOTS, NEAR_CASTLE_LEFT, RANGER_SLOTS, SLOTS, STAGING_SLOTS, VIEW, WARRIOR_SLOTS, WARRIOR_ZONE,
  buildArmy, maxSpritesForWidth, pickProportional, type ArmyMember,
} from './layout';
import { battleMode, bossStrikes, canAttack, castleLook, nextBossVisual, statusText } from './mode';
import { viewFromCampaign, viewFromGameState } from './view';

const members = (n: number, active: (i: number) => boolean = () => true, prefix = 'u'): ArmyMember[] => Array.from({ length: n }, (_, i) => ({ uid: `${prefix}${i}`, active: active(i) }));
const mix = (ms: { uid: string }[]) => CHARACTER_CLASSES.map((c) => ms.filter((m) => classForUid(m.uid) === c).length);

describe('orientation (mandatory): boss LEFT, castle + army RIGHT, characters face LEFT', () => {
  it('boss is on the left and the castle on the right of one fixed coordinate system', () => {
    assert.ok(BOSS_BOX.x < VIEW.width / 2 && CASTLE_BOX.left > VIEW.width / 2);
    assert.ok(BOSS_BOX.right < CASTLE_BOX.left);
    assert.equal(BOSS_FACING, 'right');
    assert.equal(CHARACTER_FACING, 'left');
  });
  it('warriors stand between the boss and the castle', () => {
    for (const s of WARRIOR_SLOTS) assert.ok(s.x > BOSS_BOX.right && s.x < CASTLE_BOX.left, `warrior slot ${s.x}`);
    assert.ok(WARRIOR_SLOTS.every((s) => s.x >= WARRIOR_ZONE.left && s.x <= WARRIOR_ZONE.right));
  });
  it('rangers are on the castle and mages stay near it, never among the warriors', () => {
    for (const s of RANGER_SLOTS) assert.ok(s.x >= CASTLE_BOX.left, `ranger ${s.x}`);
    for (const s of MAGE_SLOTS) assert.ok(s.x >= NEAR_CASTLE_LEFT && s.x < CASTLE_BOX.left + 20, `mage ${s.x}`);
    assert.ok(Math.max(...WARRIOR_SLOTS.map((s) => s.x)) < Math.min(...MAGE_SLOTS.map((s) => s.x)));
  });
  it('waiting students stage on the right, away from the boss', () => {
    for (const s of STAGING_SLOTS) assert.ok(s.x >= CASTLE_BOX.left);
  });
  it('every drawn sprite sits in its class zone', () => {
    const a = buildArmy(members(60, (i) => i % 4 !== 0), 'u3', 28);
    for (const sp of a.sprites) {
      if (!sp.active) assert.ok(sp.x >= CASTLE_BOX.left && sp.y > VIEW.groundY);
      else if (sp.cls === 'warrior') assert.ok(sp.x > BOSS_BOX.right && sp.x < CASTLE_BOX.left);
      else if (sp.cls === 'ranger') assert.ok(sp.x >= CASTLE_BOX.left);
      else assert.ok(sp.x >= NEAR_CASTLE_LEFT);
    }
  });
});

describe('stable cosmetic character classes', () => {
  it('are a pure function of identity: pinned values never change (a change would reshuffle every student)', () => {
    assert.deepEqual(['alice-uid', 'bob-uid', 'student-1', 'student-2', 'student-3', 'x'].map(classForUid), ['mage', 'warrior', 'mage', 'mage', 'warrior', 'ranger']);
    assert.equal(hash32('mb-class:student-1'), hash32('mb-class:student-1'));
    assert.equal(classForUid('student-1'), classForUid('student-1'));
    assert.ok([0, 1, 2, 3].includes(variantForUid('student-1')));
  });
  it('are roughly even across many identities', () => {
    const uids = Array.from({ length: 3000 }, (_, i) => `uid-${i * 7919}`);
    for (const n of mix(uids.map((uid) => ({ uid })))) assert.ok(n > 850 && n < 1150, `class share ${n}/3000`);
  });
  it('are the same however the army is built (refresh, different order, different max)', () => {
    const a = buildArmy(members(30), 'u5', 28);
    const b = buildArmy([...members(30)].reverse(), 'u5', 28);
    assert.equal(a.sprites.find((s) => s.isYou)!.cls, classForUid('u5'));
    assert.deepEqual(a.sprites.map((s) => [s.id, s.cls, s.x, s.y]), b.sprites.map((s) => [s.id, s.cls, s.x, s.y]));
  });
  it('all three classes share the exact same combat numbers (no class bonuses exist in the combat code)', async () => {
    const { readFileSync } = await import('node:fs');
    const combat = ['src/game/upgrades.ts', 'src/game/core.ts', 'src/game/campaign.ts', 'src/game/engine.ts', 'functions/src/core/service.ts'].map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(!/\b(warrior|ranger|mage|characterClass|classForUid)\b/i.test(combat), 'combat code must not know about character classes');
  });
  it('the demo classmates show all three classes', () => {
    const s = createGame({ now: Date.UTC(2026, 0, 5, 15) });
    assert.ok(mix(s.students.map((x) => ({ uid: x.id }))).every((n) => n > 0));
  });
});

describe('highlighting the current student', () => {
  it('always draws the current student, marked, even in a huge class', () => {
    for (const n of [1, 10, 25, 40, 200]) {
      const a = buildArmy(members(n, (i) => i % 3 !== 0), `u${n - 1}`, 10);
      const you = a.sprites.filter((s) => s.isYou);
      assert.equal(you.length, 1, `n=${n}`);
      assert.equal(you[0].id, `u${n - 1}`);
      assert.equal(a.sprites[a.sprites.length - 1].isYou, true, 'drawn last, on top');
    }
  });
  it('an inactive current student stands in the staging area; an active one in their class position', () => {
    const idle = buildArmy(members(5, (i) => i !== 2), 'u2', 28).sprites.find((s) => s.isYou)!;
    assert.equal(idle.active, false);
    assert.ok(STAGING_SLOTS.some((s) => s.x === idle.x && s.y === idle.y));
    const act = buildArmy(members(5), 'u2', 28).sprites.find((s) => s.isYou)!;
    assert.ok(SLOTS[act.cls].some((s) => s.x === act.x && s.y === act.y));
  });
  it('takes the front-most slot of their class', () => {
    const a = buildArmy(members(20), 'u7', 28);
    const you = a.sprites.find((s) => s.isYou)!;
    assert.deepEqual({ x: you.x, y: you.y }, SLOTS[you.cls][0]);
  });
});

describe('attack rules follow the authoritative state', () => {
  const m = (phase: 'combat' | 'training' | 'breach' | 'idle', alive = true, active = 5) => battleMode({ phase, bossAlive: alive, activeCount: active });
  it('only activated students attack, and only during active combat', () => {
    assert.equal(canAttack(m('combat'), true), true);
    assert.equal(canAttack(m('combat'), false), false, 'inactive students never attack');
  });
  it('preparation, breach, idle and waiting stop all attacks', () => {
    for (const mode of [m('training'), m('breach'), m('idle'), m('combat', true, 0), m('combat', false)] as const) {
      assert.equal(canAttack(mode, true), false, mode);
      assert.equal(bossStrikes(mode, 1000), false, mode);
    }
    assert.equal(m('training'), 'preparation');
    assert.equal(m('breach'), 'breach');
    assert.equal(m('combat', true, 0), 'waiting');
  });
  it('the boss strikes the castle only while the server attack timer is running', () => {
    assert.equal(bossStrikes('fighting', 123), true);
    assert.equal(bossStrikes('fighting', null), false);
  });
  it('castle looks damaged when breached or below half health', () => {
    assert.equal(castleLook('breach', 0.1), 'breached');
    assert.equal(castleLook('fighting', 0.4), 'hurt');
    assert.equal(castleLook('fighting', 0.9), 'ok');
    assert.equal(castleLook('preparation', 0.9), 'ok');
  });
  it('boss defeat transitions: alive -> defeating once, then defeated; late arrivals see it already gone', () => {
    assert.equal(nextBossVisual(null, true), 'alive');
    assert.equal(nextBossVisual('alive', false), 'defeating');
    assert.equal(nextBossVisual('defeating', false), 'defeated');
    assert.equal(nextBossVisual('defeated', false), 'defeated');
    assert.equal(nextBossVisual(null, false), 'defeated');
    assert.equal(nextBossVisual('defeated', true), 'alive', 'a new boss appears');
  });
  it('every state has clear text, so animation is never the only signal', () => {
    const base = { now: 0, nextAttackAt: 3_600_000, trainingEndsAt: 7_200_000, weekEnd: 9e9, castlePct: 0.2, bossNumber: 2 };
    assert.match(statusText({ ...base, mode: 'fighting' }).detail, /Next boss attack in/);
    assert.match(statusText({ ...base, mode: 'preparation' }).title, /Preparation/);
    assert.match(statusText({ ...base, mode: 'preparation' }).detail, /Boss 2 defeated/);
    assert.match(statusText({ ...base, mode: 'breach' }).title, /breached/i);
    assert.match(statusText({ ...base, mode: 'breach' }).detail, /25%/);
    assert.match(statusText({ ...base, mode: 'waiting' }).title, /first student/);
  });
});

describe('large classrooms', () => {
  it('never draw more sprites than the limit, and the limit shrinks on small screens', () => {
    assert.ok(maxSpritesForWidth(1200) > maxSpritesForWidth(700) && maxSpritesForWidth(700) > maxSpritesForWidth(500) && maxSpritesForWidth(500) > maxSpritesForWidth(320));
    for (const n of [1, 10, 25, 40, 100, 200]) {
      for (const max of [10, 14, 20, 28]) {
        const a = buildArmy(members(n, (i) => i % 5 !== 0), 'u0', max);
        assert.ok(a.sprites.length <= max, `${n} students, max ${max}: drew ${a.sprites.length}`);
        const keys = new Set(a.sprites.map((s) => `${s.x},${s.y},${s.active}`));
        assert.equal(keys.size, a.sprites.length, 'no two sprites share a slot');
      }
    }
  });
  it('shows everyone when the class is small', () => {
    for (const n of [1, 10, 25]) assert.equal(buildArmy(members(n), 'u0', 28).sprites.length, n);
    assert.equal(buildArmy(members(40), 'u0', 28).sprites.length, 28);
  });
  it('totals always describe the WHOLE class, not the sprites drawn', () => {
    const a = buildArmy(members(40, (i) => i < 31), 'u0', 12);
    assert.equal(a.totalActive, 31);
    assert.equal(a.totalInactive, 9);
    assert.equal(a.sprites.length + a.hiddenActive + a.hiddenInactive, 40);
    assert.ok(a.hiddenActive > 0);
  });
  it('keeps the class mix of the whole group when it has to thin the army', () => {
    const all = members(200);
    const picked = pickProportional(all, 24);
    assert.equal(picked.length, 24);
    const whole = mix(all).map((n) => (n / 200) * 24);
    mix(picked).forEach((n, i) => assert.ok(Math.abs(n - whole[i]) <= 1.01, `class ${i}: ${n} vs ${whole[i].toFixed(1)}`));
  });
  it('a class with active students shows at least one active fighter even in a crowd of waiting students', () => {
    const a = buildArmy([...members(60, () => false, 'w'), { uid: 'solo', active: true }], null, 10);
    assert.ok(a.sprites.some((s) => s.active));
  });
});

describe('adapters never change combat numbers', () => {
  it('multiplayer view reports the campaign HP and the FULL class totals', () => {
    const c = newCampaign(Date.UTC(2026, 0, 5, 15), 'America/New_York');
    c.studentCount = 40;
    c.activatedCount = 31;
    c.dpsSum = 123;
    c.castleHp = 777;
    c.baseCastleMaxHp = 1000;
    c.phase = 'combat';
    c.boss = { number: 3, name: 'Ember Drake', maxHp: 5000, hp: 4321, attackPerHour: 100, spawnedAt: 0 };
    const v = viewFromCampaign(c, 1, 'room-1', { uid: 'me', activated: true });
    assert.equal(v.bossHp, 4321);
    assert.equal(v.bossMaxHp, 5000);
    assert.equal(v.castleHp, 777);
    assert.equal(v.activeCount, 31);
    assert.equal(v.studentCount, 40);
    assert.equal(v.members.length, 40);
    assert.equal(v.members.filter((x) => x.active).length, 31);
    assert.equal(v.members[0].uid, 'me');
    const army = buildArmy(v.members, 'me', 12);
    assert.equal(army.totalActive, 31, 'sprite limit does not change the real active count');
    assert.ok(v.members.every((x) => x.uid === 'me' || x.uid.startsWith('room-1#')), 'classmates are anonymous: no real ids or names');
  });
  it('demo view uses the exact simulated students', () => {
    const s = createGame({ now: Date.UTC(2026, 0, 5, 15), studentCount: 25 });
    const v = viewFromGameState(s);
    assert.equal(v.members.length, 25);
    assert.equal(v.self?.uid, 's1');
    assert.equal(v.castleHp, s.battle.castleHp);
  });
});
