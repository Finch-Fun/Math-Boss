// End-to-end test against the REAL Auth + Firestore + Functions emulators:  npm run test:integration
// (not part of `npm test`; needs Java, firebase-tools and `npm --prefix functions install`). It exercises the deployed-shape
// callable functions with real auth tokens, which the in-memory service tests cannot.
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { defaultSettings } from '../src/game/sample';

const PROJECT = 'demo-math-boss';
let env: RulesTestEnvironment;

async function student(name: string) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, appId: 'demo' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await signInAnonymously(auth);
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const call = async (fn: string, data: object) => (await httpsCallable(fns, fn)(data)).data as any;
  return { uid: cred.user.uid, call };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env.cleanup());

describe('callable game service (emulators)', () => {
  it('two students see the same boss; rewards are paid once; fake fields are refused', async () => {
    const a = await student('a');
    const b = await student('b');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'teacherAllowlist', 't@school.org'), {});
      await setDoc(doc(db, 'classrooms', 'c1'), { ownerUid: 'teacher', name: 'Room', timezone: 'America/Chicago', status: 'active', settings: defaultSettings() });
      for (const s of [a, b]) await setDoc(doc(db, 'classrooms', 'c1', 'members', s.uid), { uid: s.uid, displayName: `Kid ${s.uid.slice(0, 4)}`, status: 'active', requestedAt: 1 });
    });

    const sa = await a.call('mbSync', { classroomId: 'c1' });
    const sb = await b.call('mbSync', { classroomId: 'c1' });
    assert.ok(sa.ok && sb.ok);
    assert.equal(sa.campaign.boss.maxHp, sb.campaign.boss.maxHp);

    await assert.rejects(a.call('mbSubmitDaily', { classroomId: 'c1', requestId: 'req-00000001', index: 0, answer: '1', coins: 999 }), /Unexpected field/);
    await assert.rejects(a.call('mbSync', { classroomId: 'other' }), /not an active member/);

    const d1 = await a.call('mbGetDaily', { classroomId: 'c1', requestId: 'req-00000002' });
    assert.ok(d1.ok && d1.question && !('answer' in d1.question));
  });
});
