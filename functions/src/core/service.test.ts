import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from '../../../src/game/constants';
import { castleMax, classDpsOf, personalDps } from '../../../src/game/campaign';
import { projectCost } from '../../../src/game/projects';
import { upgradeCost } from '../../../src/game/upgrades';
import { weekEndZ } from '../../../src/game/zoned';
import { controlDevClock, devClockEnabled, clockFor, systemClock, devClock } from './clock';
import { ServiceError } from './errors';
import { LIMITS } from './service';
import { MON_9AM, SALT, TEACHER, setup } from './harness';
import { MemoryStore } from './store';

const rejects = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ServiceError && e.code === code, `expected ${code}`);

describe('1. shared boss', () => {
  it('two students joining one classroom see the same boss, castle and week', async () => {
    const r = setup({ students: 2 });
    const a = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    const b = await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    assert.ok(a.campaign.boss);
    assert.equal(a.campaign.boss!.number, 1);
    assert.deepEqual(a.campaign.boss, b.campaign.boss);
    assert.equal(a.campaign.castleHp, b.campaign.castleHp);
    assert.equal(a.campaign.weekIndex, b.campaign.weekIndex);
    assert.equal(a.campaign.boss!.attackPerHour, 9.6); // 120 x 2/25
    assert.equal(a.me!.nickname, 'Kid u1');
    assert.equal(b.me!.nickname, 'Kid u2');
  });
});

describe('2/7. damage is shared and comes from server timing', () => {
  it("Student A's damage appears for Student B, computed from elapsed server time (offline)", async () => {
    const r = setup({ students: 2 });
    const first = await r.correct('u1');
    assert.ok(first.ok);
    const hp0 = r.campaign().boss!.hp;
    const dps = personalDps(r.player('u1').upgrades);
    r.hours(10); // A is "offline" the whole time; nothing happens until someone makes a trusted request
    assert.equal(r.campaign().boss!.hp, hp0, 'no write without a trusted request');
    const b = await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.ok(b.ok);
    if (!b.ok) return;
    const expected = hp0 - dps * 10 * 3600;
    assert.ok(Math.abs(b.campaign.boss!.hp - expected) < 1e-6, `${b.campaign.boss!.hp} vs ${expected}`);
    assert.equal(b.campaign.lastSettledAt, r.clock.now);
    const a = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.ok(a.ok && a.me);
    if (a.ok) assert.ok(Math.abs(a.me!.weekDamage - dps * 10 * 3600) < 1e-6);
  });

  it('a browser-supplied timestamp is rejected, so time cannot be moved', async () => {
    const r = setup({ students: 1 });
    await rejects(r.svc.sync(r.as('u1'), { classroomId: 'c1', now: 1 } as never), 'invalid-argument');
    await rejects(r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 0, answer: '1', now: 5 } as never), 'invalid-argument');
  });
});

describe('3/4. Daily Review rewards', () => {
  it('a correct answer pays once; replays and repeats cannot pay again', async () => {
    const r = setup({ students: 1 });
    const a = await r.answer('u1', true);
    const req = { classroomId: 'c1', requestId: r.rid(), index: a.index, answer: a.answer };
    const one = await r.svc.submitDaily(r.as('u1'), req);
    assert.ok(one.ok && one.correct === true && one.coins === 10);
    const replay = await r.svc.submitDaily(r.as('u1'), req); // identical request id
    assert.ok(replay.ok && replay.replayed === true && replay.correct === true);
    const again = await r.svc.submitDaily(r.as('u1'), { ...req, requestId: r.rid() }); // same question, new id
    assert.ok(!again.ok && again.code === 'stale');
    assert.equal(r.player('u1').coins, 10);
    assert.equal(r.player('u1').lifetimeCoins, 10);
    assert.equal(r.campaign().stats.questions, 1);
  });

  it('pays 10 / 5 / 2 by attempt, returns hints, and a wrong answer pays nothing', async () => {
    const r = setup({ students: 1 });
    const w1 = await r.answer('u1', false);
    const wrong = await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: w1.index, answer: w1.answer });
    assert.ok(wrong.ok && wrong.correct === false && wrong.hint.length > 0 && wrong.wrongCount === 1);
    assert.equal(r.player('u1').coins, 0);
    const ok = await r.correct('u1');
    assert.ok(ok.ok && ok.correct && ok.coins === 5 && ok.attempts === 2);

    // third or later: 2 coins. Next question: wrong, wrong, correct.
    for (let i = 0; i < 2; i++) {
      const w = await r.answer('u1', false);
      await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: w.index, answer: w.answer });
    }
    const third = await r.correct('u1');
    assert.ok(third.ok && third.correct && third.coins === 2 && third.attempts === 3);
    assert.equal(r.player('u1').coins, 7);

    // a first-attempt answer on the following question pays 10
    const fresh = await r.correct('u1');
    assert.ok(fresh.ok && fresh.correct && fresh.coins === 10);
  });

  it('daily questions never expose the answer, hints or the secret seed', async () => {
    const r = setup({ students: 1 });
    const d = await r.svc.getDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(d.ok && d.question);
    if (!d.ok || !d.question) return;
    const wire = JSON.stringify(d);
    assert.ok(!wire.includes(SALT));
    assert.ok(!('answer' in d.question) && !('hints' in d.question));
    assert.equal(d.question.id, '1:0');
  });

  it('the question stream is not the public deterministic one (salted)', async () => {
    const r = setup({ students: 1 });
    const d = await r.svc.getDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    const { generateDailyQuestion } = await import('../../../src/game/questions');
    const publicQ = generateDailyQuestion({ studentId: 'u1', weekIndex: 1, index: 0, preset: 'balanced', skills: ['addition', 'subtraction', 'multiplication', 'division', 'fractions', 'missing'] });
    assert.ok(d.ok && d.question);
    if (d.ok && d.question) assert.notEqual(d.question.prompt, publicQ.prompt);
  });

  it('only the days unlocked so far (classroom timezone) are available', async () => {
    // Monday 23:30 in Chicago is already Tuesday in UTC. Settings: 2 on Monday, 3 on Tuesday.
    const r = setup({ students: 1, settings: { dailyQuestions: [2, 3, 0, 0, 0, 0, 0] }, start: Date.UTC(2026, 0, 6, 5, 30, 0) });
    const s = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.ok(s.ok && s.me);
    if (s.ok) assert.equal(s.me!.dailyUnlocked, 2); // still Monday locally
    r.hours(1);
    const t = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    if (t.ok) assert.equal(t.me!.dailyUnlocked, 5);
  });

  it('with a limit of 0 there is no question', async () => {
    const r = setup({ students: 1, settings: { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] } });
    const d = await r.svc.getDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(d.ok && d.question === null);
  });
});

describe('bonus questions', () => {
  it('one attempt only: 20 coins if correct, 0 if wrong, and no retry', async () => {
    const r = setup({ students: 1 });
    const list = await r.svc.getBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(list.ok && list.enabled && list.questions.length === 3);
    if (!list.ok) return;
    assert.ok(!JSON.stringify(list.questions).includes('"correctChoice"'), 'unanswered questions never reveal the answer');
    const { bonusQuestionsForWeek } = await import('../../../src/game/questions');
    const q0 = bonusQuestionsForWeek(1)[0];
    const right = await r.svc.submitBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 0, choice: q0.correct });
    assert.ok(right.ok && right.correct && right.coins === 20);
    const retry = await r.svc.submitBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 0, choice: q0.correct });
    assert.ok(!retry.ok && retry.code === 'locked');
    const q1 = bonusQuestionsForWeek(1)[1];
    const wrong = await r.svc.submitBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 1, choice: (q1.correct + 1) % q1.choices.length });
    assert.ok(wrong.ok && !wrong.correct && wrong.coins === 0);
    const retry2 = await r.svc.submitBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 1, choice: q1.correct });
    assert.ok(!retry2.ok && retry2.code === 'locked');
    assert.equal(r.player('u1').coins, 20);
  });
});

describe('5. fake coins, damage and rewards are rejected', () => {
  it('unknown fields (coins, damage, reward, studentId, uid) are refused outright', async () => {
    const r = setup({ students: 2 });
    const a = await r.answer('u1', true);
    for (const extra of [{ coins: 9999 }, { damage: 1e9 }, { reward: 20 }, { studentId: 'u2' }, { uid: 'u2' }, { attempts: 1 }]) {
      await rejects(r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: a.index, answer: a.answer, ...extra } as never), 'invalid-argument');
    }
    await rejects(r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 5, coins: 100 } as never), 'invalid-argument');
    assert.equal(r.player('u1').coins, 0);
    assert.equal(r.campaign().stats.questions, 0);
  });

  it('an invalid, replayed or out-of-order question index never pays', async () => {
    const r = setup({ students: 1 });
    const a = await r.answer('u1', true);
    const skip = await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: a.index + 5, answer: a.answer });
    assert.ok(!skip.ok && skip.code === 'stale');
    await rejects(r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: -1, answer: '1' }), 'invalid-argument');
    await rejects(r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: 'x', index: 0, answer: '1' }), 'invalid-argument');
    const nan = await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 0, answer: 'abc' });
    assert.ok(!nan.ok);
    assert.equal(r.player('u1').coins, 0, 'rejected requests change nothing');
    assert.equal(r.player('u1').week!.questions, 0);
  });

  it('a teacher cannot act as a student, and an outsider cannot act at all', async () => {
    const r = setup({ students: 1 });
    await rejects(r.svc.submitDaily(TEACHER, { classroomId: 'c1', requestId: r.rid(), index: 0, answer: '1' }), 'permission-denied');
    await rejects(r.svc.donate(TEACHER, { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 1 }), 'permission-denied');
    await rejects(r.svc.getDaily(TEACHER, { classroomId: 'c1', requestId: r.rid() }), 'permission-denied');
    await rejects(r.svc.sync(r.as('stranger'), { classroomId: 'c1' }), 'permission-denied');
    await rejects(r.svc.sync({ uid: '' } as never, { classroomId: 'c1' }), 'unauthenticated');
    // a pending or removed member is not a player
    r.store.seed('classrooms/c1/members/pend', { uid: 'pend', displayName: 'Pending', status: 'pending', requestedAt: 1 });
    await rejects(r.svc.sync(r.as('pend'), { classroomId: 'c1' }), 'permission-denied');
    // a member document keyed by one uid cannot be used by another
    await rejects(r.svc.sync(r.as('u9'), { classroomId: 'c1' }), 'permission-denied');
  });

  it('abuse is bounded by a per-player rate limit', async () => {
    const r = setup({ students: 1, settings: { dailyQuestions: [20, 0, 0, 0, 0, 0, 0] } });
    let denied = 0;
    for (let i = 0; i < LIMITS.opsPerMinute + 5; i++) {
      try {
        const w = await r.answer('u1', false);
        await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: w.index, answer: w.answer });
      } catch (e) {
        if (e instanceof ServiceError && e.code === 'resource-exhausted') denied++;
        else throw e;
      }
    }
    assert.ok(denied >= 5);
    r.clock.now += 61_000;
    const w = await r.answer('u1', false);
    const ok = await r.svc.submitDaily(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: w.index, answer: w.answer });
    assert.ok(ok.ok);
  });
});

describe('6. upgrades', () => {
  async function richStudent(r: ReturnType<typeof setup>, coins = 500) {
    r.store.seed('classrooms/c1/players/u1', { uid: 'u1', nickname: 'Kid u1', coins, lifetimeCoins: coins, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 } });
    await r.correct('u1'); // activates
  }

  it('a purchase deducts the exact cost and raises the class DPS', async () => {
    const r = setup({ students: 2 });
    await richStudent(r);
    const before = r.campaign().dpsSum;
    const coins0 = r.player('u1').coins;
    const res = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0 });
    assert.ok(res.ok && res.cost === upgradeCost('damage', 0) && res.level === 1);
    assert.equal(r.player('u1').coins, coins0 - upgradeCost('damage', 0));
    assert.ok(r.campaign().dpsSum > before);
    assert.equal(r.campaign().dpsSum, personalDps({ damage: 1, speed: 0, critChance: 0, critDamage: 0 }));
    assert.equal(r.player('u1').week!.dps, r.campaign().dpsSum);
  });

  it('boss damage after an upgrade uses the higher DPS only from the purchase onward', async () => {
    const r = setup({ students: 2 });
    await richStudent(r);
    const hp0 = r.campaign().boss!.hp;
    const d0 = r.campaign().dpsSum;
    r.hours(2);
    await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0 });
    const d1 = r.campaign().dpsSum;
    r.hours(2);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    const expected = hp0 - d0 * 2 * 3600 - d1 * 2 * 3600;
    assert.ok(Math.abs(r.campaign().boss!.hp - expected) < 1e-6);
    const me = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    if (me.ok) assert.ok(Math.abs(me.me!.weekDamage - (d0 * 2 + d1 * 2) * 3600) < 1e-6);
  });

  it('rejects stale, duplicate, unaffordable and maxed purchases', async () => {
    const r = setup({ students: 1 });
    await richStudent(r);
    const req = { classroomId: 'c1', requestId: r.rid(), key: 'damage' as const, expectedLevel: 0 };
    const ok = await r.svc.purchaseUpgrade(r.as('u1'), req);
    assert.ok(ok.ok);
    const replay = await r.svc.purchaseUpgrade(r.as('u1'), req);
    assert.ok(replay.ok && replay.replayed);
    const stale = await r.svc.purchaseUpgrade(r.as('u1'), { ...req, requestId: r.rid() }); // same view, new id
    assert.ok(!stale.ok && stale.code === 'stale');
    assert.equal(r.player('u1').upgrades.damage, 1);
    r.store.seed('classrooms/c1/players/u1', { ...r.player('u1'), coins: 1 } as never);
    const poor = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'speed', expectedLevel: 0 });
    assert.ok(!poor.ok && poor.code === 'coins');
    r.store.seed('classrooms/c1/players/u1', { ...r.player('u1'), coins: 1e9, upgrades: { damage: 1, speed: 0, critChance: 35, critDamage: 0 } } as never);
    const maxed = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'critChance', expectedLevel: 35 });
    assert.ok(!maxed.ok && maxed.code === 'maxed');
    await rejects(r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'hax' as never, expectedLevel: 0 }), 'invalid-argument');
  });

  it('validates the subtraction challenge on the server when it is enabled', async () => {
    const r = setup({ students: 1, settings: { requireMathForUpgrades: true } });
    await richStudent(r, 100);
    const coins = r.player('u1').coins;
    const cost = upgradeCost('damage', 0);
    const none = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0 });
    assert.ok(!none.ok && none.code === 'math');
    const wrong = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0, claimedRemaining: coins - cost + 1 });
    assert.ok(!wrong.ok && wrong.code === 'math' && wrong.hint);
    assert.equal(r.player('u1').coins, coins);
    const right = await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0, claimedRemaining: coins - cost });
    assert.ok(right.ok);
  });

  it('upgrading before activation raises personal DPS without joining the class DPS early', async () => {
    const r = setup({ students: 2 });
    r.store.seed('classrooms/c1/players/u2', { uid: 'u2', nickname: 'Kid u2', coins: 100, lifetimeCoins: 100, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 } });
    await r.svc.purchaseUpgrade(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), key: 'damage', expectedLevel: 0 });
    assert.equal(r.campaign().dpsSum, 0);
    await r.correct('u2');
    assert.equal(r.campaign().dpsSum, personalDps({ damage: 1, speed: 0, critChance: 0, critDamage: 0 }));
  });
});

describe('8. concurrent settlement never double-counts', () => {
  it('many simultaneous requests at the same and later times equal one clean settlement', async () => {
    const r = setup({ students: 4 });
    await r.correct('u1');
    await r.correct('u2');
    const hp0 = r.campaign().boss!.hp;
    const dps = r.campaign().dpsSum;
    r.hours(6);
    const results = await Promise.all(r.uids.flatMap((u) => [r.svc.sync(r.as(u), { classroomId: 'c1' }), r.svc.sync(r.as(u), { classroomId: 'c1' })]));
    assert.ok(results.every((x) => x.ok));
    assert.ok(Math.abs(r.campaign().boss!.hp - (hp0 - dps * 6 * 3600)) < 1e-6);
    assert.ok(r.store.retries > 0, 'the test must actually have produced contention');
    // and a mix of mutating and read requests
    const hp1 = r.campaign().boss!.hp;
    r.hours(3);
    await Promise.all([r.correct('u1'), r.correct('u2'), r.correct('u3'), r.svc.sync(r.as('u4'), { classroomId: 'c1' })]);
    const newDps = r.campaign().dpsSum; // u3 activated at this instant
    assert.ok(Math.abs(r.campaign().boss!.hp - (hp1 - dps * 3 * 3600)) < 1e-6, 'u3 only fights from activation onward');
    assert.ok(newDps > dps);
  });

  it('settling a classroom twice at the same server time changes nothing', async () => {
    const r = setup({ students: 2 });
    await r.correct('u1');
    r.hours(4);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    const snap = JSON.stringify(r.campaign());
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.equal(JSON.stringify(r.campaign()), snap);
  });
});

describe('9/10. donations and projects', () => {
  async function fund(r: ReturnType<typeof setup>, uid: string, coins: number) {
    r.store.seed(`classrooms/c1/players/${uid}`, { uid, nickname: `Kid ${uid}`, coins, lifetimeCoins: coins, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 } });
  }

  it('two students donating at the same moment lose and duplicate no coins', async () => {
    const r = setup({ students: 3 });
    await fund(r, 'u1', 100);
    await fund(r, 'u2', 100);
    await r.svc.sync(r.as('u3'), { classroomId: 'c1' });
    const cost = projectCost('walls', 0, 3);
    assert.ok(cost > 40);
    const [a, b] = await Promise.all([
      r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 20 }),
      r.svc.donate(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 20 }),
    ]);
    assert.ok(a.ok && b.ok);
    assert.equal(r.campaign().projects.walls.funded, 40);
    assert.equal(r.campaign().stats.donated, 40);
    assert.equal(r.player('u1').coins + r.player('u2').coins, 160);
    assert.equal(r.player('u1').week!.donated + r.player('u2').week!.donated, 40);
  });

  it('a repeated donation request id charges once', async () => {
    const r = setup({ students: 3 });
    await fund(r, 'u1', 100);
    const req = { classroomId: 'c1', requestId: r.rid(), project: 'banner' as const, amount: 10 };
    await r.svc.donate(r.as('u1'), req);
    const again = await r.svc.donate(r.as('u1'), req);
    assert.ok(again.ok && again.replayed);
    assert.equal(r.player('u1').coins, 90);
    assert.equal(r.campaign().projects.banner.funded, 10);
  });

  it('cannot donate more than you have, a negative amount, or a fraction', async () => {
    const r = setup({ students: 3 });
    await fund(r, 'u1', 10);
    const over = await r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 11 });
    assert.ok(!over.ok && over.code === 'coins');
    for (const amount of [-5, 0, 1.5, Number.NaN, 1e12]) {
      await rejects(r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount }), 'invalid-argument');
    }
    assert.equal(r.player('u1').coins, 10);
  });

  it('a project completes exactly once even when donors overshoot at the same time, and never over-charges', async () => {
    const r = setup({ students: 3 });
    for (const u of r.uids) await fund(r, u, 100);
    const cost = projectCost('walls', 0, 3); // 48
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    const castleBefore = castleMax(r.campaign());
    const results = await Promise.all(r.uids.map((u) => r.svc.donate(r.as(u), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 30 })));
    assert.ok(results.every((x) => x.ok));
    const c = r.campaign();
    assert.equal(c.projects.walls.level, 1, 'completed once');
    const charged = results.reduce((s, x) => s + (x.ok ? x.charged : 0), 0);
    const completions = results.filter((x) => x.ok && x.completed).length;
    assert.equal(completions, 1);
    assert.equal(charged, cost + c.projects.walls.funded); // everything charged went to level 1 or into level 2's progress
    assert.equal(r.uids.reduce((s, u) => s + r.player(u).coins, 0), 300 - charged);
    assert.ok(castleMax(c) > castleBefore);
    assert.equal(c.log.filter((l) => l.text.includes('Reinforce Walls')).length, 1);
  });

  it('costs scale with class size and the next level costs more', async () => {
    const small = setup({ students: 5 });
    const big = setup({ students: 50 });
    await small.svc.sync(small.as('u1'), { classroomId: 'c1' });
    await big.svc.sync(big.as('u1'), { classroomId: 'c1' });
    assert.equal(small.campaign().studentCount, 5);
    assert.equal(big.campaign().studentCount, 50);
    assert.equal(projectCost('walls', 0, 50), 800);
    assert.ok(projectCost('walls', 1, 50) > 800);
  });

  it('weekly project progress resets at the boundary while coins stay', async () => {
    const r = setup({ students: 3 });
    await fund(r, 'u1', 100);
    await r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'plating', amount: 25 });
    assert.equal(r.campaign().projects.plating.funded, 25);
    r.clock.now = r.campaign().weekEnd + 1000;
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().projects.plating.funded, 0);
    assert.equal(r.campaign().stats.donated, 0);
    assert.equal(r.player('u1').coins, 75, 'unspent coins persist');
  });
});

describe('11. castle breach, repair and recovery', () => {
  async function weakClass() {
    const r = setup({ students: 1 });
    await r.correct('u1');
    r.patchCampaign((c) => {
      c.boss!.hp = c.boss!.maxHp = 1e12; // unbeatable, so the castle is the story
    });
    return r;
  }

  it('the castle falls, attacks pause, and combat resumes once repaired to 25%', async () => {
    const r = await weakClass();
    const cap = castleMax(r.campaign());
    assert.equal(cap, 400);
    r.hours(100);
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().phase, 'breach');
    assert.ok(r.campaign().stats.breaches >= 1);
    assert.equal(r.campaign().nextAttackAt, null, 'attacks are paused');
    // fund Castle Repairs (cost for 1 student = 10)
    r.store.seed('classrooms/c1/players/u1', { ...r.player('u1'), coins: 1000 } as never);
    const cost = projectCost('repairs', 0, 1);
    const don = await r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'repairs', amount: cost });
    assert.ok(don.ok && don.completed);
    assert.ok(r.campaign().castleHp > 0.19 * cap);
    assert.equal(r.campaign().phase, 'combat');
    assert.ok(r.campaign().nextAttackAt !== null);
  });

  it('automatic emergency reconstruction prevents a permanent deadlock', async () => {
    const r = await weakClass();
    r.patchCampaign((c) => {
      c.phase = 'breach';
      c.castleHp = 0;
      c.nextAttackAt = null;
    });
    r.hours(30); // 0.5% of 400 HP per hour -> 25% takes 50 hours
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().phase, 'breach');
    r.hours(25);
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().phase, 'combat');
  });

  it('correct Daily Review answers add emergency repair during a breach', async () => {
    const r = await weakClass();
    r.patchCampaign((c) => {
      c.phase = 'breach';
      c.castleHp = 0;
      c.nextAttackAt = null;
    });
    const before = r.campaign().castleHp;
    await r.correct('u1');
    assert.ok(r.campaign().castleHp > before);
    assert.ok(r.campaign().stats.emergencyRepairHp > 0);
  });

  it('armor from Iron Plating reduces hourly castle damage', async () => {
    const r = await weakClass();
    r.patchCampaign((c) => {
      c.projects.plating.level = 5; // 25%
    });
    const hp0 = r.campaign().castleHp;
    r.hours(10);
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    const lost = hp0 - r.campaign().castleHp;
    assert.ok(lost > 0 && lost <= 10 * 4.8 * 0.75 + 1e-6);
  });
});

describe('12. boss defeat and 24h preparation', () => {
  it('defeating the boss starts 24h of training, then Boss 2 appears', async () => {
    const r = setup({ students: 3 });
    await r.correct('u1');
    r.patchCampaign((c) => {
      c.boss!.hp = 50;
      c.boss!.maxHp = 50;
    });
    r.hours(1);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    const c1 = r.campaign();
    assert.equal(c1.phase, 'training');
    assert.equal(c1.bossesDefeated, 1);
    assert.ok(c1.trainingEndsAt! - c1.lastSettledAt > 22 * HOUR);
    r.hours(22);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.equal(r.campaign().phase, 'training');
    r.hours(4);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.equal(r.campaign().phase, 'combat');
    assert.equal(r.campaign().boss!.number, 2);
    assert.ok(r.campaign().boss!.maxHp > c1.boss!.maxHp * 1.4, 'Boss 2 scales up by 1.5x');
    assert.equal(r.campaign().boss!.attackPerHour, 17.28); // 120 x 3/25 x 1.2
  });

  it('during preparation the castle takes no damage and the boss cannot be hurt', async () => {
    const r = setup({ students: 3 });
    await r.correct('u1');
    r.patchCampaign((c) => {
      c.boss!.hp = 1;
    });
    r.hours(1);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    const hp = r.campaign().castleHp;
    r.hours(10);
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.equal(r.campaign().castleHp, hp);
  });
});

describe('13/14. weekly campaigns', () => {
  it('weekly reset keeps coins and upgrades but resets boss, castle, projects, activation and question progress', async () => {
    const r = setup({ students: 2 });
    r.store.seed('classrooms/c1/players/u1', { uid: 'u1', nickname: 'Kid u1', coins: 200, lifetimeCoins: 200, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 } });
    await r.correct('u1');
    await r.svc.purchaseUpgrade(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), key: 'speed', expectedLevel: 0 });
    await r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 10 });
    const coins = r.player('u1').coins;
    const upgrades = { ...r.player('u1').upgrades };
    const lifetime = r.player('u1').lifetimeCoins;
    r.clock.now = r.campaign().weekEnd + 5 * 60_000;
    const res = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.ok(res.ok);
    const c = r.campaign();
    assert.equal(c.weekIndex, 2);
    assert.equal(c.boss!.number, 1);
    assert.equal(c.bossesDefeated, 0);
    assert.equal(c.castleHp, castleMax(c));
    assert.equal(c.projects.walls.funded, 0);
    assert.equal(c.activatedCount, 0);
    assert.equal(c.dpsSum, 0);
    assert.equal(c.history.length, 1);
    const p = r.player('u1');
    assert.equal(p.coins, coins);
    assert.deepEqual(p.upgrades, upgrades);
    assert.equal(p.lifetimeCoins, lifetime);
    assert.equal(p.week!.index, 2);
    assert.equal(p.week!.activated, false);
    assert.equal(p.week!.questions, 0);
    // the student must re-activate by answering a question again
    const again = await r.correct('u1');
    assert.ok(again.ok && again.correct);
    assert.equal(r.campaign().activatedCount, 1);
    assert.equal(r.campaign().dpsSum, personalDps(upgrades));
  });

  it('rolls over at Monday 12:00 AM local across the spring DST change (167h week)', async () => {
    const start = Date.UTC(2026, 2, 2, 12, 0, 0); // Monday Mar 2, 06:00 CST
    const r = setup({ students: 1, start });
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    const c = r.campaign();
    assert.equal(c.weekStart, Date.UTC(2026, 2, 2, 6, 0, 0));
    assert.equal(c.weekEnd, Date.UTC(2026, 2, 9, 5, 0, 0)); // 00:00 CDT
    assert.equal(c.weekEnd - c.weekStart, 167 * HOUR);
    r.clock.now = c.weekEnd - 1;
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().weekIndex, 1);
    r.clock.now = c.weekEnd;
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().weekIndex, 2);
    assert.equal(r.campaign().weekStart, c.weekEnd);
  });

  it('rolls over across the fall DST change and in other zones', async () => {
    const fall = setup({ students: 1, start: Date.UTC(2026, 10, 2, 12, 0, 0) }); // Monday Nov 2 (CST after change)
    await fall.svc.sync(fall.as('u1'), { classroomId: 'c1' });
    const prev = Date.UTC(2026, 9, 26, 5, 0, 0); // Monday Oct 26 00:00 CDT, a 169h week to Nov 2 00:00 CST
    assert.equal(weekEndZ(prev, 'America/Chicago') - prev, 169 * HOUR);
    for (const tz of ['Pacific/Auckland', 'Europe/London', 'Asia/Kolkata', 'America/Sao_Paulo']) {
      const r = setup({ students: 1, tz, start: Date.UTC(2026, 2, 28, 12, 0, 0) });
      await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
      const c = r.campaign();
      r.clock.now = c.weekEnd;
      await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
      assert.equal(r.campaign().weekIndex, 2, tz);
      assert.equal(r.campaign().weekStart, c.weekEnd, tz);
    }
  });

  it('offline across many weeks is settled in bounded work on the next request', async () => {
    const r = setup({ students: 3 });
    await r.correct('u1');
    r.clock.now += 300 * 7 * 24 * HOUR;
    const t0 = Date.now();
    const res = await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.ok(Date.now() - t0 < 3000);
    assert.ok(res.ok);
    assert.ok(r.campaign().weekEnd > r.clock.now);
    assert.ok(r.campaign().skippedWeeks > 250);
    assert.ok(r.store.writes < 20, 'a long gap is one settlement, not one write per week');
  });

  it('zero-question weeks activate every student automatically (including later joiners)', async () => {
    const r = setup({ students: 2, settings: { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] } });
    const a = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.ok(a.ok && a.me!.activated);
    assert.equal(r.campaign().activatedCount, 2);
    assert.ok(r.campaign().dpsSum > 0);
    const hp0 = r.campaign().boss!.hp;
    r.hours(3);
    const b = await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.ok(b.ok && b.me!.activated);
    assert.ok(r.campaign().boss!.hp < hp0);
    // a student approved afterwards is activated on first contact and starts dealing damage from then
    r.store.seed('classrooms/c1/members/u3', { uid: 'u3', displayName: 'Late', status: 'active', requestedAt: r.clock.now });
    r.hours(1);
    const late = await r.svc.sync(r.as('u3'), { classroomId: 'c1' });
    assert.ok(late.ok && late.me!.activated);
    assert.equal(r.campaign().activatedCount, 3);
  });
});

describe('15. cross-classroom isolation', () => {
  it("a student of one classroom cannot read or change another's, and the campaigns are independent", async () => {
    const r = setup({ students: 2 });
    r.addRoom('c2', 'teacher2', ['v1', 'v2']);
    await r.correct('u1');
    await r.correct('v1', 'c2');
    r.hours(5);
    await rejects(r.svc.sync(r.as('u1'), { classroomId: 'c2' }), 'permission-denied');
    await rejects(r.svc.donate(r.as('u1'), { classroomId: 'c2', requestId: r.rid(), project: 'walls', amount: 1 }), 'permission-denied');
    await rejects(r.svc.getDaily(r.as('v1'), { classroomId: 'c1', requestId: r.rid() }), 'permission-denied');
    await r.svc.sync(r.as('u2'), { classroomId: 'c1' });
    assert.ok(r.campaign('c1').boss!.hp < r.campaign('c1').boss!.maxHp);
    assert.equal(r.campaign('c2').lastSettledAt, MON_9AM, 'c2 was not settled or touched by c1 activity');
    assert.equal(r.campaign('c2').boss!.hp, r.campaign('c2').boss!.maxHp);
    assert.equal(r.store.peek('classrooms/c2/players/u1'), undefined);
    // another classroom's teacher cannot sync this classroom either
    r.store.seed('teacherAllowlist/other@school.org', {});
    await rejects(r.svc.sync({ uid: 'teacher2', email: 'other@school.org', emailVerified: true, provider: 'google.com' }, { classroomId: 'c1' }), 'permission-denied');
  });
});

describe('16. teacher Battle Report reads shared state', () => {
  it('the owning allowlisted teacher gets the shared campaign and no private student data', async () => {
    const r = setup({ students: 2 });
    await r.correct('u1');
    r.hours(2);
    const rep = await r.svc.sync(TEACHER, { classroomId: 'c1' });
    assert.ok(rep.ok);
    if (!rep.ok) return;
    assert.equal(rep.me, null);
    assert.ok(rep.campaign.boss && rep.campaign.activatedCount === 1);
    assert.equal(rep.campaign.stats.questions, 1);
    assert.ok(!JSON.stringify(rep).includes('recentOps'));
    assert.ok(!JSON.stringify(rep).includes('Kid u1'), 'no per-student identities in shared state');
    assert.equal(r.store.peek('classrooms/c1/players/teacher1'), undefined, 'a teacher never gets a player');
  });

  it('a non-allowlisted, unverified or anonymous caller who owns the classroom is still refused', async () => {
    const r = setup({ students: 1 });
    await rejects(r.svc.sync({ uid: 'teacher1', email: 'x@y.org', emailVerified: true, provider: 'google.com' }, { classroomId: 'c1' }), 'permission-denied');
    await rejects(r.svc.sync({ ...TEACHER, emailVerified: false }, { classroomId: 'c1' }), 'permission-denied');
    await rejects(r.svc.sync({ ...TEACHER, provider: 'anonymous' }, { classroomId: 'c1' }), 'permission-denied');
  });
});

describe('injected test clock', () => {
  it('is refused unless this is the emulator with the explicit opt-in', async () => {
    const store = new MemoryStore();
    await rejects(controlDevClock(store, {}, { action: 'set', ms: 1 }), 'permission-denied');
    await rejects(controlDevClock(store, { FUNCTIONS_EMULATOR: 'true' }, { action: 'set', ms: 1 }), 'permission-denied');
    await rejects(controlDevClock(store, { MATHBOSS_ENABLE_TEST_CLOCK: 'true' }, { action: 'set', ms: 1 }), 'permission-denied');
    assert.equal(clockFor({}), systemClock);
    assert.equal(clockFor({ FUNCTIONS_EMULATOR: 'true', MATHBOSS_ENABLE_TEST_CLOCK: 'true' }), devClock);
    assert.equal(devClockEnabled({ FUNCTIONS_EMULATOR: 'true', MATHBOSS_ENABLE_TEST_CLOCK: 'true' }), true);
  });

  it('in the emulator it can set and advance time, and the service then uses it', async () => {
    const env = { FUNCTIONS_EMULATOR: 'true', MATHBOSS_ENABLE_TEST_CLOCK: 'true' };
    const r = setup({ students: 1 });
    const { GameService } = await import('./service');
    const svc = new GameService({ store: r.store, clock: clockFor(env), newSalt: () => SALT });
    await controlDevClock(r.store, env, { action: 'set', ms: MON_9AM });
    await svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().lastSettledAt, MON_9AM);
    const t = await controlDevClock(r.store, env, { action: 'advance', ms: 26 * HOUR });
    assert.equal(t.now, MON_9AM + 26 * HOUR);
    await svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().lastSettledAt, MON_9AM + 26 * HOUR);
  });

  it('production service ignores any dev-clock document', async () => {
    const r = setup({ students: 1 });
    r.store.seed('serverOnly/devClock', { mode: 'fixed', value: 5 });
    await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.equal(r.campaign().lastSettledAt, MON_9AM); // the harness clock; the dev doc was never consulted
  });
});

describe('class DPS sanity', () => {
  it('classDpsOf includes the Battle Banner', async () => {
    const r = setup({ students: 2 });
    await r.correct('u1');
    r.patchCampaign((c) => {
      c.projects.banner.level = 2;
    });
    const c = r.campaign();
    assert.ok(Math.abs(classDpsOf(c) - c.dpsSum * 1.1) < 1e-9);
  });
});
