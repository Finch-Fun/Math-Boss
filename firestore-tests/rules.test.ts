// Firestore security-rule tests. They need the Firebase emulators:  npm run test:rules
// (this file is NOT part of `npm test`, which must work without Java or the emulators).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, describe, it } from 'node:test';
import { defaultSettings } from '../src/game/sample';

let env: RulesTestEnvironment;

const google = (email: string) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const anon = { firebase: { sign_in_provider: 'anonymous' } };
const TEACHER_A = { uid: 'tA', claims: google('a@school.org') };
const TEACHER_B = { uid: 'tB', claims: google('b@school.org') };

const db = (uid: string, claims: object) => env.authenticatedContext(uid, claims).firestore();
const teacherA = () => db(TEACHER_A.uid, TEACHER_A.claims);
const teacherB = () => db(TEACHER_B.uid, TEACHER_B.claims);
const student = (uid: string) => db(uid, anon);

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-math-boss-rules', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => env.cleanup());
afterEach(async () => {
  await env.clearFirestore();
});

async function seedAllowlist(...emails: string[]) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const e of emails) await setDoc(doc(ctx.firestore(), 'teacherAllowlist', e), { addedBy: 'console' });
  });
}

const classroomData = (owner: string, code: string, extra: Record<string, unknown> = {}) => ({
  ownerUid: owner,
  name: 'Room 12',
  gradeLevel: '5',
  timezone: 'America/Chicago',
  joinCode: code,
  joinApproval: 'teacher',
  status: 'active',
  settings: defaultSettings(),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

async function createClassroom(fs: ReturnType<typeof teacherA>, owner: string, cid: string, code: string, extra: Record<string, unknown> = {}) {
  const b = writeBatch(fs);
  b.set(doc(fs, 'classrooms', cid), classroomData(owner, code, extra));
  b.set(doc(fs, 'joinCodes', code), { classroomId: cid, ownerUid: owner, classroomName: 'Room 12', joinApproval: (extra.joinApproval as string) ?? 'teacher' });
  await b.commit();
}

async function requestJoin(fs: ReturnType<typeof student>, uid: string, cid: string, code: string, status = 'pending', name = 'Star Fox') {
  const b = writeBatch(fs);
  b.set(doc(fs, 'classrooms', cid, 'members', uid), { uid, displayName: name, status, joinCode: code, requestedAt: serverTimestamp() });
  b.set(doc(fs, 'studentClassrooms', uid, 'classrooms', cid), { classroomId: cid, classroomName: 'Room 12', joinedAt: serverTimestamp() });
  await b.commit();
}

async function approve(fs: ReturnType<typeof teacherA>, teacher: string, cid: string, uid: string, name = 'Star Fox') {
  const b = writeBatch(fs);
  b.update(doc(fs, 'classrooms', cid, 'members', uid), { status: 'active', approvedAt: serverTimestamp(), approvedBy: teacher });
  b.set(doc(fs, 'classrooms', cid, 'players', uid), {
    uid,
    nickname: name,
    coins: 0,
    lifetimeCoins: 0,
    upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 },
    createdAt: serverTimestamp(),
  });
  await b.commit();
}

describe('unauthenticated access', () => {
  it('cannot read or write anything protected', async () => {
    await seedAllowlist('a@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'classrooms', 'c1')));
    await assertFails(getDoc(doc(anonDb, 'joinCodes', 'ABCD2345')));
    await assertFails(getDocs(collection(anonDb, 'classrooms', 'c1', 'members')));
    await assertFails(setDoc(doc(anonDb, 'classrooms', 'c9'), classroomData('x', 'ZZZZ2222')));
  });
});

describe('teacher roles', () => {
  it('only allowlisted, verified Google accounts can create a classroom', async () => {
    await seedAllowlist('a@school.org');
    await assertSucceeds(createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345'));
    await assertFails(createClassroom(db('x', google('x@gmail.com')), 'x', 'c2', 'ABCD2346')); // not on the allowlist
    await assertFails(createClassroom(db('tA2', { ...google('a@school.org'), email_verified: false }), 'tA2', 'c3', 'ABCD2347'));
    await assertFails(createClassroom(student('s1'), 's1', 'c4', 'ABCD2348')); // anonymous
    await assertFails(createClassroom(db('tA3', { ...anon, email: 'a@school.org', email_verified: true }), 'tA3', 'c5', 'ABCD2349')); // right email, wrong provider
  });

  it('the allowlist and teacher flags cannot be written or read by any client', async () => {
    await seedAllowlist('a@school.org');
    await assertFails(setDoc(doc(student('s1'), 'teacherAllowlist', 'kid@x.org'), { ok: true }));
    await assertFails(setDoc(doc(teacherA(), 'teacherAllowlist', 'a2@school.org'), { ok: true }));
    await assertFails(getDoc(doc(teacherA(), 'teacherAllowlist', 'a@school.org')));
    await assertFails(setDoc(doc(student('s1'), 'teacherProfiles', 's1'), { displayName: 'x', email: 'x', updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(teacherA(), 'teacherProfiles', 'tA'), { displayName: 'A', email: 'a@school.org', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(teacherA(), 'teacherProfiles', 'tA'), { displayName: 'A', email: 'a@school.org', role: 'admin', updatedAt: serverTimestamp() }));
  });

  it('removing a teacher from the allowlist revokes access to their classrooms', async () => {
    await seedAllowlist('a@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await assertSucceeds(getDoc(doc(teacherA(), 'classrooms', 'c1')));
    await env.withSecurityRulesDisabled(async (ctx) => deleteDoc(doc(ctx.firestore(), 'teacherAllowlist', 'a@school.org')));
    await assertFails(getDoc(doc(teacherA(), 'classrooms', 'c1')));
  });
});

describe('classroom ownership', () => {
  it('teachers create under their own UID only, update only their own, and cannot delete', async () => {
    await seedAllowlist('a@school.org', 'b@school.org');
    await assertFails(createClassroom(teacherA(), 'tB', 'c1', 'ABCD2345')); // spoofed owner
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await assertSucceeds(updateDoc(doc(teacherA(), 'classrooms', 'c1'), { name: 'Renamed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(teacherB(), 'classrooms', 'c1'), { name: 'Hijack', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(teacherA(), 'classrooms', 'c1'), { ownerUid: 'tB', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(teacherA(), 'classrooms', 'c1'), { gradeLevel: '99', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(teacherA(), 'classrooms', 'c1')));
  });

  it('teachers list only their own classrooms, and a teacher can own several', async () => {
    await seedAllowlist('a@school.org', 'b@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await createClassroom(teacherA(), 'tA', 'c2', 'ABCD2346');
    await createClassroom(teacherB(), 'tB', 'c3', 'ABCD2347');
    const mine = await assertSucceeds(getDocs(query(collection(teacherA(), 'classrooms'), where('ownerUid', '==', 'tA'))));
    assert.equal(mine.size, 2);
    await assertFails(getDocs(query(collection(teacherA(), 'classrooms'), where('ownerUid', '==', 'tB'))));
    await assertFails(getDocs(collection(teacherA(), 'classrooms'))); // unscoped listing
  });

  it('a join code cannot be claimed twice', async () => {
    await seedAllowlist('a@school.org', 'b@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await assertFails(createClassroom(teacherB(), 'tB', 'c2', 'ABCD2345'));
  });
});

describe('student joining and membership', () => {
  async function setup(extra: Record<string, unknown> = {}) {
    await seedAllowlist('a@school.org', 'b@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345', extra);
  }

  it('students can look a code up by exact value but never list codes', async () => {
    await setup();
    await assertSucceeds(getDoc(doc(student('s1'), 'joinCodes', 'ABCD2345')));
    await assertFails(getDocs(collection(student('s1'), 'joinCodes')));
  });

  it('joining needs the real code and creates a pending membership under the student\'s own UID', async () => {
    await setup();
    await assertSucceeds(requestJoin(student('s1'), 's1', 'c1', 'ABCD2345'));
    await assertFails(requestJoin(student('s2'), 's2', 'c1', 'WRONG222')); // wrong code
    await assertFails(requestJoin(student('s3'), 's2', 'c1', 'ABCD2345')); // impersonating another UID
    await assertFails(requestJoin(student('s4'), 's4', 'c1', 'ABCD2345', 'active')); // self-approval
    await assertFails(requestJoin(student('s1'), 's1', 'c1', 'ABCD2345')); // cannot overwrite an existing membership
  });

  it('a pending student cannot read the classroom or other students; they can read their own membership', async () => {
    await setup();
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    await requestJoin(student('s2'), 's2', 'c1', 'ABCD2345', 'pending', 'Moon Cat');
    await assertFails(getDoc(doc(student('s1'), 'classrooms', 'c1')));
    await assertSucceeds(getDoc(doc(student('s1'), 'classrooms', 'c1', 'members', 's1')));
    await assertFails(getDoc(doc(student('s1'), 'classrooms', 'c1', 'members', 's2')));
    await assertFails(getDocs(collection(student('s1'), 'classrooms', 'c1', 'members')));
  });

  it('students cannot approve themselves or change membership', async () => {
    await setup();
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    await assertFails(updateDoc(doc(student('s1'), 'classrooms', 'c1', 'members', 's1'), { status: 'active', approvedAt: serverTimestamp(), approvedBy: 's1' }));
    await assertFails(deleteDoc(doc(student('s1'), 'classrooms', 'c1', 'members', 's1')));
  });

  it('only the owning teacher can approve; approval creates a zero-value player and unlocks the classroom', async () => {
    await setup();
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    await assertFails(approve(teacherB(), 'tB', 'c1', 's1')); // another teacher
    await assertSucceeds(approve(teacherA(), 'tA', 'c1', 's1'));
    await assertSucceeds(getDoc(doc(student('s1'), 'classrooms', 'c1')));
    await assertSucceeds(getDoc(doc(student('s1'), 'classrooms', 'c1', 'players', 's1')));
    const roster = await assertSucceeds(getDocs(collection(teacherA(), 'classrooms', 'c1', 'members')));
    assert.equal(roster.size, 1);
  });

  it('auto-approve classrooms admit students immediately, but still only with zero-value players', async () => {
    await setup({ joinApproval: 'auto' });
    await assertFails(requestJoin(student('s1'), 's1', 'c1', 'ABCD2345', 'pending')); // status must follow the classroom setting
    // One Firestore instance for the whole batch: every doc() reference must come from the same instance as writeBatch().
    const s1 = student('s1');
    const b = writeBatch(s1);
    b.set(doc(s1, 'classrooms', 'c1', 'members', 's1'), { uid: 's1', displayName: 'Star Fox', status: 'active', joinCode: 'ABCD2345', requestedAt: serverTimestamp() });
    b.set(doc(s1, 'classrooms', 'c1', 'players', 's1'), {
      uid: 's1', nickname: 'Star Fox', coins: 0, lifetimeCoins: 0, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, createdAt: serverTimestamp(),
    });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(s1, 'classrooms', 'c1')));

    // The auto-approve path must still reject a player that starts with coins.
    const s2 = student('s2');
    const bad = writeBatch(s2);
    bad.set(doc(s2, 'classrooms', 'c1', 'members', 's2'), { uid: 's2', displayName: 'Moon Cat', status: 'active', joinCode: 'ABCD2345', requestedAt: serverTimestamp() });
    bad.set(doc(s2, 'classrooms', 'c1', 'players', 's2'), {
      uid: 's2', nickname: 'Moon Cat', coins: 500, lifetimeCoins: 500, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, createdAt: serverTimestamp(),
    });
    await assertFails(bad.commit());
  });

  it('archived classrooms reject new joins', async () => {
    await setup();
    await updateDoc(doc(teacherA(), 'classrooms', 'c1'), { status: 'archived', updatedAt: serverTimestamp() });
    await assertFails(requestJoin(student('s1'), 's1', 'c1', 'ABCD2345'));
  });

  it('a regenerated code invalidates the old one for joining', async () => {
    await setup();
    const t = teacherA();
    const b = writeBatch(t);
    b.update(doc(t, 'classrooms', 'c1'), { joinCode: 'NEWC2345', updatedAt: serverTimestamp() });
    b.set(doc(t, 'joinCodes', 'NEWC2345'), { classroomId: 'c1', ownerUid: 'tA', classroomName: 'Room 12', joinApproval: 'teacher' });
    b.delete(doc(t, 'joinCodes', 'ABCD2345'));
    await assertSucceeds(b.commit());
    await assertFails(requestJoin(student('s1'), 's1', 'c1', 'ABCD2345'));
    await assertSucceeds(requestJoin(student('s2'), 's2', 'c1', 'NEWC2345'));
  });

  it('a student can find their own classroom list but not anyone else\'s', async () => {
    await setup();
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    const mine = await assertSucceeds(getDocs(collection(student('s1'), 'studentClassrooms', 's1', 'classrooms')));
    assert.equal(mine.size, 1);
    await assertFails(getDocs(collection(student('s2'), 'studentClassrooms', 's1', 'classrooms')));
    await assertFails(setDoc(doc(student('s2'), 'studentClassrooms', 's2', 'classrooms', 'c1'), { classroomId: 'c1', classroomName: 'x', joinedAt: serverTimestamp() })); // no membership doc
  });
});

describe('authoritative data cannot be changed by clients', () => {
  async function approved() {
    await seedAllowlist('a@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    await approve(teacherA(), 'tA', 'c1', 's1');
  }

  it('students cannot award themselves coins, upgrades, or write combat state', async () => {
    await approved();
    const p = doc(student('s1'), 'classrooms', 'c1', 'players', 's1');
    await assertFails(updateDoc(p, { coins: 9999 }));
    await assertFails(updateDoc(p, { 'upgrades.damage': 5 }));
    await assertFails(setDoc(p, { uid: 's1', nickname: 'Star Fox', coins: 9999, lifetimeCoins: 0, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(student('s1'), 'classrooms', 'c1', 'battle', 'current'), { bossHp: 0, castleHp: 1e9 }));
  });

  it('teachers cannot edit coins either (a trusted backend will, later)', async () => {
    await approved();
    await assertFails(updateDoc(doc(teacherA(), 'classrooms', 'c1', 'players', 's1'), { coins: 100 }));
    await assertFails(setDoc(doc(teacherA(), 'classrooms', 'c1', 'battle', 'current'), { bossHp: 0 }));
  });

  it('a new player document cannot start with coins or upgrades', async () => {
    await seedAllowlist('a@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    const t = teacherA();
    const b = writeBatch(t);
    b.update(doc(t, 'classrooms', 'c1', 'members', 's1'), { status: 'active', approvedAt: serverTimestamp(), approvedBy: 'tA' });
    b.set(doc(t, 'classrooms', 'c1', 'players', 's1'), { uid: 's1', nickname: 'Star Fox', coins: 50, lifetimeCoins: 50, upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, createdAt: serverTimestamp() });
    await assertFails(b.commit());
  });
});

describe('cross-classroom isolation', () => {
  it('members of one classroom and other teachers see nothing of another classroom', async () => {
    await seedAllowlist('a@school.org', 'b@school.org');
    await createClassroom(teacherA(), 'tA', 'c1', 'ABCD2345');
    await createClassroom(teacherB(), 'tB', 'c2', 'ABCD2346');
    await requestJoin(student('s1'), 's1', 'c1', 'ABCD2345');
    await approve(teacherA(), 'tA', 'c1', 's1');
    await requestJoin(student('s2'), 's2', 'c2', 'ABCD2346', 'pending', 'Moon Cat');
    await approve(teacherB(), 'tB', 'c2', 's2', 'Moon Cat');

    await assertSucceeds(getDoc(doc(student('s1'), 'classrooms', 'c1')));
    await assertFails(getDoc(doc(student('s1'), 'classrooms', 'c2')));
    await assertFails(getDoc(doc(student('s1'), 'classrooms', 'c2', 'players', 's2')));
    await assertFails(getDoc(doc(student('s1'), 'classrooms', 'c1', 'players', 's2')));
    await assertFails(getDocs(collection(teacherA(), 'classrooms', 'c2', 'members')));
    await assertFails(getDocs(collection(teacherA(), 'classrooms', 'c2', 'players')));
    await assertFails(approve(teacherA(), 'tA', 'c2', 's2'));
    // a student cannot enrol in classroom 2 using classroom 1's code
    await assertFails(requestJoin(student('s3'), 's3', 'c2', 'ABCD2345'));
  });
});
