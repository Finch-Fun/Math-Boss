import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR } from '../../../src/game/constants';
import { setup } from './harness';

// Every write to the shared campaign document is delivered to every listening student (one billed read each), so the service only
// writes it when something discrete changes. Elapsed time alone is recomputed deterministically and never needs a write.
describe('read/write economy of the shared campaign document', () => {
  it('syncing, wrong answers and bonus answers do not rewrite the campaign', async () => {
    const r = setup({ students: 2 });
    assert.ok((await r.correct('u1')).ok);
    r.hours(3);
    const stored = JSON.stringify(r.stored());

    assert.ok((await r.svc.sync(r.as('u2'), { classroomId: 'c1' })).ok);
    assert.ok((await r.svc.getDaily(r.as('u2'), { classroomId: 'c1', requestId: r.rid() })).ok);
    const w = await r.answer('u2', false);
    const wrong = await r.svc.submitDaily(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), index: w.index, answer: w.answer });
    assert.ok(wrong.ok && !wrong.correct);
    const b = await r.svc.submitBonus(r.as('u2'), { classroomId: 'c1', requestId: r.rid(), index: 0, choice: 0 });
    assert.ok(b.ok);
    assert.equal(JSON.stringify(r.stored()), stored, 'the campaign document was not written');
    assert.equal(r.player('u2').week!.currentWrong, 1, "the student's own record still saved the wrong attempt");
  });

  it('a state change (activation, upgrade by an active student, donation) does write it, with the settled time', async () => {
    const r = setup({ students: 2 });
    assert.ok((await r.correct('u1')).ok);
    r.hours(2);
    assert.ok((await r.correct('u2')).ok);
    assert.equal(r.stored().lastSettledAt, r.clock.now);
    assert.equal(r.stored().activatedCount, 2);
    r.hours(1);
    const d = await r.svc.donate(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), project: 'walls', amount: 5 });
    assert.ok(d.ok);
    assert.equal(r.stored().projects.walls.funded, 5);
    assert.equal(r.stored().lastSettledAt, r.clock.now);
  });

  it('a boss defeat or a new week (a discrete event) is persisted by whichever request settles it', async () => {
    const r = setup({ students: 2 });
    assert.ok((await r.correct('u1')).ok);
    r.hours(24 * 8);
    assert.ok((await r.svc.sync(r.as('u2'), { classroomId: 'c1' })).ok);
    assert.equal(r.stored().weekIndex, 2);
  });

  it('skipping writes changes nothing: many small read-only settlements equal one big one', async () => {
    const mk = async () => {
      const r = setup({ students: 3 });
      for (const u of r.uids) assert.ok((await r.correct(u)).ok);
      return r;
    };
    const a = await mk();
    const b = await mk();
    a.hours(30);
    for (let i = 0; i < 30; i++) {
      b.hours(1);
      assert.ok((await b.svc.sync(b.as('u1'), { classroomId: 'c1' })).ok);
    }
    const ca = a.campaign();
    const cb = b.campaign();
    assert.ok(Math.abs(ca.boss!.hp - cb.boss!.hp) < 1e-3);
    assert.equal(ca.castleHp, cb.castleHp);
    assert.equal(ca.phase, cb.phase);
    const sa = await a.svc.sync(a.as('u2'), { classroomId: 'c1' });
    const sb = await b.svc.sync(b.as('u2'), { classroomId: 'c1' });
    assert.ok(sa.ok && sb.ok && sa.me && sb.me);
    if (sa.ok && sb.ok && sa.me && sb.me) assert.ok(Math.abs(sa.me.weekDamage - sb.me.weekDamage) < 1e-3, 'per-student damage is the same too');
    void HOUR;
  });

  it('a roster larger than the supported size is refused instead of reading without bound', async () => {
    const r = setup({ students: 1 });
    const many = Array.from({ length: 201 }, (_, i) => `x${i}`);
    r.addRoom('big', 'teacher1', many);
    await assert.rejects(r.svc.sync(r.as('x1'), { classroomId: 'big' }), (e: unknown) => (e as { code?: string }).code === 'failed-precondition');
  });
});
