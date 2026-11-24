import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from '../../../src/game/constants';
import { personalDps } from '../../../src/game/campaign';
import { ServiceError } from './errors';
import { MON_9AM, TEACHER, setup, type Room } from './harness';

const rejects = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ServiceError && e.code === code, `expected ${code}`);
const remove = (r: Room, studentId: string, who = TEACHER) => r.svc.removeStudent(who, { classroomId: 'c1', studentId });
const dpsOf = (r: Room, uid: string) => personalDps(r.player(uid).upgrades);
const SEC = 1000;

async function activatedClass(n = 3, opts: Parameters<typeof setup>[0] = {}) {
  const r = setup({ students: n, ...opts });
  for (const u of r.uids) assert.ok((await r.correct(u)).ok);
  return r;
}

describe('removed or un-approved students stop contributing damage at the removal time', () => {
  it('counts their damage up to the removal instant (even after 10 idle hours), and none afterwards', async () => {
    const r = await activatedClass(3);
    const hp0 = r.stored().boss!.hp;
    const [d1, d2, d3] = r.uids.map((u) => dpsOf(r, u));
    r.hours(10); // nobody makes a request: the campaign is only settled by the removal itself
    assert.equal(r.stored().boss!.hp, hp0, 'nothing was written while idle');
    const res = await remove(r, 'u2');
    assert.ok(res.ok && res.removed && res.wasContributing);
    assert.equal(res.ok && res.effectiveAt, r.clock.now, 'effective time is the server clock');

    const atRemoval = r.stored();
    assert.ok(Math.abs(atRemoval.boss!.hp - (hp0 - (d1 + d2 + d3) * 10 * 3600)) < 1e-3, 'all three counted for the first 10 hours');
    assert.ok(Math.abs(atRemoval.dpsSum - (d1 + d3)) < 1e-9);
    assert.equal(atRemoval.activatedCount, 2);
    assert.ok(Math.abs(r.player('u2').week!.damage - d2 * 10 * 3600) < 1e-3, "u2's damage up to removal is kept");

    r.hours(10);
    const later = r.campaign();
    assert.ok(Math.abs(later.boss!.hp - (atRemoval.boss!.hp - (d1 + d3) * 10 * 3600)) < 1e-3, 'u2 adds nothing after removal');
    assert.ok(Math.abs(r.player('u2').week!.damage - d2 * 10 * 3600) < 1e-3);
    const m = r.store.peek<{ status: string; removedAt: number; removedBy: string }>('classrooms/c1/members/u2')!;
    assert.deepEqual([m.status, m.removedAt, m.removedBy], ['removed', r.clock.now - 10 * HOUR, TEACHER.uid]);
  });

  it("a removed student can no longer act, and the others are unaffected", async () => {
    const r = await activatedClass(2);
    await remove(r, 'u2');
    await rejects(r.svc.getDaily(r.as('u2'), { classroomId: 'c1', requestId: r.rid() }), 'permission-denied');
    await rejects(r.svc.donate(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 1 }), 'permission-denied');
    assert.ok((await r.svc.sync(r.as('u1'), { classroomId: 'c1' })).ok);
  });

  it('is safe to repeat and only the owning, allow-listed teacher can do it', async () => {
    const r = await activatedClass(2);
    r.addRoom('c2', 'teacher2', ['v1']);
    r.store.seed('teacherAllowlist/other@school.org', {});
    const other = { uid: 'teacher2', email: 'other@school.org', emailVerified: true, provider: 'google.com' };
    await rejects(remove(r, 'u1', other), 'permission-denied'); // another teacher
    await rejects(remove(r, 'u1', r.as('u1')), 'permission-denied'); // a student cannot remove (even themselves or others)
    await rejects(remove(r, 'u2', r.as('u1')), 'permission-denied');
    await rejects(remove(r, 'u1', { ...TEACHER, provider: 'anonymous' }), 'permission-denied'); // not a Google sign-in
    await rejects(remove(r, 'u1', { uid: TEACHER.uid, email: 'evil@x.org', emailVerified: true, provider: 'google.com' }), 'permission-denied'); // not allow-listed
    await rejects(remove(r, 'nobody'), 'not-found');
    await rejects(r.svc.removeStudent(TEACHER, { classroomId: 'c1', studentId: 'u1', coins: 5 } as never), 'invalid-argument');
    const a = await remove(r, 'u1');
    const b = await remove(r, 'u1');
    assert.ok(a.ok && a.removed && b.ok && !b.removed, 'the second call changes nothing');
    assert.ok(Math.abs(r.stored().dpsSum - dpsOf(r, 'u2')) < 1e-9, 'subtracted exactly once');
    assert.equal(r.stored().activatedCount, 1);
  });

  it('removing a student who never contributed (pending, or not activated) changes no damage', async () => {
    const r = setup({ students: 2 });
    assert.ok((await r.correct('u1')).ok); // u2 is a member but has never answered this week
    const before = r.stored().dpsSum;
    const res = await remove(r, 'u2');
    assert.ok(res.ok && res.removed && !res.wasContributing);
    assert.equal(r.stored().dpsSum, before);
    assert.equal(r.stored().activatedCount, 1);
  });

  it('simultaneous removal and student requests never double count or lose damage', async () => {
    const r = await activatedClass(3);
    const [d1, , d3] = r.uids.map((u) => dpsOf(r, u));
    r.hours(5);
    const settled = await Promise.allSettled([
      remove(r, 'u2'),
      r.correct('u1'),
      r.svc.donate(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 5 }),
      r.correct('u2'),
      r.svc.sync(r.as('u3'), { classroomId: 'c1' }),
    ]);
    // The student's own requests either completed before the removal, or were refused after it. Never an inconsistent mix.
    for (const s of [settled[2], settled[3]]) {
      if (s.status === 'rejected') assert.ok(s.reason instanceof ServiceError && s.reason.code === 'permission-denied');
    }
    assert.ok(settled[0].status === 'fulfilled');
    const c = r.stored();
    assert.ok(Math.abs(c.dpsSum - (d1 + d3)) < 1e-9, `aggregate DPS is exactly the two remaining students (${c.dpsSum})`);
    assert.equal(c.activatedCount, 2);
    const w2 = r.player('u2').week!;
    assert.equal(w2.activated, false);
    // From here on only u1 and u3 deal damage.
    const hp = r.campaign().boss!.hp;
    r.hours(4);
    assert.ok(Math.abs(hp - r.campaign().boss!.hp - (d1 + d3) * 4 * 3600) < 1e-3);
  });

  it('a zero-question week counts students who never opened the app; removing one stops their damage', async () => {
    const r = setup({ students: 3, settings: { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] } });
    assert.ok((await r.svc.sync(r.as('u1'), { classroomId: 'c1' })).ok); // creates the campaign; u2 never opens the app
    const d = personalDps({ damage: 0, speed: 0, critChance: 0, critDamage: 0 });
    assert.ok(Math.abs(r.stored().dpsSum - 3 * d) < 1e-9);
    r.hours(5);
    const res = await remove(r, 'u2');
    assert.ok(res.ok && res.removed && res.wasContributing);
    assert.ok(Math.abs(r.stored().dpsSum - 2 * d) < 1e-9);
    const hp = r.stored().boss!.hp;
    r.hours(3);
    assert.ok(Math.abs(hp - r.campaign().boss!.hp - 2 * d * 3 * 3600) < 1e-3);
  });

  it('restoring a student does not count them again until they act (zero-question weeks: on their next request)', async () => {
    const r = await activatedClass(2);
    await remove(r, 'u2');
    const afterRemoval = r.stored().dpsSum;
    // The teacher restores the student (a client write that the rules still allow).
    r.store.seed('classrooms/c1/members/u2', { uid: 'u2', displayName: 'Kid u2', status: 'active', requestedAt: 1, approvedAt: r.clock.now });
    r.hours(1);
    assert.ok((await r.svc.sync(r.as('u2'), { classroomId: 'c1' })).ok);
    assert.equal(r.stored().dpsSum, afterRemoval, 'a restored student is not counted until they answer a question');
    assert.ok((await r.correct('u2')).ok);
    assert.ok(r.stored().dpsSum > afterRemoval, 'counted again after a correct answer');

    const z = setup({ students: 2, settings: { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] } });
    await z.svc.sync(z.as('u1'), { classroomId: 'c1' });
    await remove(z, 'u2');
    z.store.seed('classrooms/c1/members/u2', { uid: 'u2', displayName: 'Kid u2', status: 'active', requestedAt: 1, approvedAt: z.clock.now });
    await z.svc.sync(z.as('u2'), { classroomId: 'c1' });
    assert.ok(Math.abs(z.stored().dpsSum - 2 * personalDps({ damage: 0, speed: 0, critChance: 0, critDamage: 0 })) < 1e-9);
  });

  it('the next week starts without the removed student (class size, castle)', async () => {
    const r = await activatedClass(3);
    await remove(r, 'u3');
    r.hours(24 * 7);
    const res = await r.svc.sync(r.as('u1'), { classroomId: 'c1' });
    assert.ok(res.ok);
    const c = r.stored();
    assert.equal(c.weekIndex, 2);
    assert.equal(c.studentCount, 2);
    assert.equal(c.baseCastleMaxHp, 800);
  });

  it('removal does not disturb approved balance or other students’ coins and upgrades', async () => {
    const r = await activatedClass(2);
    const before = r.player('u1');
    await remove(r, 'u2');
    assert.deepEqual(r.player('u1').upgrades, before.upgrades);
    assert.equal(r.player('u1').coins, before.coins);
    assert.equal(r.player('u2').coins, 10, "the removed student's coins stay on their record");
  });

  it('uses the server clock only: nothing in the request can set the effective time', async () => {
    const r = await activatedClass(2);
    await rejects(r.svc.removeStudent(TEACHER, { classroomId: 'c1', studentId: 'u2', now: MON_9AM } as never), 'invalid-argument');
    await rejects(r.svc.removeStudent(TEACHER, { classroomId: 'c1', studentId: 'u2', removedAt: 1 } as never), 'invalid-argument');
    assert.equal(SEC, 1000);
  });
});
