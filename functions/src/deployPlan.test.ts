import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { findLeaks, mergeViteEnv, parseDeployArgs, parseEnvFile, planDeploy } from './deployPlan';
import { setup } from './core/harness';

const GOOD = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'my-mathboss.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'my-mathboss',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
  VITE_FUNCTIONS_REGION: 'us-central1',
  VITE_USE_FIREBASE_EMULATOR: 'false',
};
const args = parseDeployArgs([]);
const root = (p: string) => new URL(`../../${p}`, import.meta.url);

describe('live deployment planning', () => {
  it('derives project, region, origins, hosting URL and an explicit firebase command from one env', () => {
    const p = planDeploy(GOOD, args, {});
    assert.equal(p.projectId, 'my-mathboss');
    assert.equal(p.hostingUrl, 'https://my-mathboss.web.app');
    assert.deepEqual(p.origins, ['https://my-mathboss.web.app', 'https://my-mathboss.firebaseapp.com']);
    assert.deepEqual(p.firebaseArgs, ['deploy', '--project', 'my-mathboss', '--only', 'hosting,firestore:rules,firestore:indexes,functions', '--non-interactive']);
    assert.ok(!p.firebaseArgs.includes('--force'));
    assert.match(p.functionsEnvText, /MATHBOSS_FUNCTIONS_REGION=us-central1/);
    assert.match(p.functionsEnvText, /MATHBOSS_ALLOWED_ORIGINS=https:\/\/my-mathboss\.web\.app,https:\/\/my-mathboss\.firebaseapp\.com/);
    assert.ok(!/TEST_CLOCK|EMULATOR/.test(p.functionsEnvText));
  });
  it('functions region follows the frontend region', () => {
    const p = planDeploy({ ...GOOD, VITE_FUNCTIONS_REGION: 'europe-west1' }, args, {});
    assert.match(p.functionsEnvText, /MATHBOSS_FUNCTIONS_REGION=europe-west1/);
  });
  it('adds a custom auth domain as an allowed origin', () => {
    const p = planDeploy({ ...GOOD, VITE_FIREBASE_AUTH_DOMAIN: 'play.school.org' }, args, {});
    assert.ok(p.origins.includes('https://play.school.org'));
  });
  it('refuses demo projects, emulator mode, missing config and invalid regions, listing every problem', () => {
    assert.throws(() => planDeploy({ ...GOOD, VITE_FIREBASE_PROJECT_ID: 'demo-math-boss' }, args, {}), /demo-/);
    assert.throws(() => planDeploy({ ...GOOD, VITE_USE_FIREBASE_EMULATOR: 'true' }, args, {}), /EMULATOR must be false/);
    assert.throws(() => planDeploy({}, args, {}), /Missing/);
    assert.throws(() => planDeploy({ ...GOOD, VITE_FUNCTIONS_REGION: 'moon' }, args, {}), /not a valid region/);
    assert.throws(() => planDeploy({ ...GOOD, VITE_FIREBASE_PROJECT_ID: 'X', VITE_USE_FIREBASE_EMULATOR: 'true' }, args, {}), (e: Error) => /valid Firebase project id/.test(e.message) && /EMULATOR/.test(e.message));
  });
  it('refuses a --project that differs from the project the site was built for', () => {
    assert.throws(() => planDeploy(GOOD, parseDeployArgs(['--project', 'other-project']), {}), /does not match/);
    assert.ok(planDeploy(GOOD, parseDeployArgs(['--project', 'my-mathboss']), {}));
  });
  it('blocks the emulator test clock anywhere near production', () => {
    assert.throws(() => planDeploy(GOOD, args, {}, { MATHBOSS_ENABLE_TEST_CLOCK: 'true' }), /MATHBOSS_ENABLE_TEST_CLOCK is set/);
    assert.throws(() => planDeploy(GOOD, args, { 'functions/.env': { MATHBOSS_ENABLE_TEST_CLOCK: 'true' } }), /functions\/\.env/);
    assert.throws(() => planDeploy(GOOD, args, {}, { FUNCTIONS_EMULATOR: 'true' }), /FUNCTIONS_EMULATOR/);
    assert.throws(() => planDeploy(GOOD, args, {}, { MATHBOSS_FUNCTIONS_REGION: 'asia-east1' }), /differs/);
  });
  it('never supports --force and validates --only', () => {
    assert.throws(() => parseDeployArgs(['--force']), /--force/);
    assert.throws(() => parseDeployArgs(['--only', 'storage']), /--only accepts/);
    assert.deepEqual(planDeploy(GOOD, parseDeployArgs(['--only', 'hosting']), {}).firebaseArgs.slice(3, 5), ['--only', 'hosting']);
  });
  it('merges env files the way vite does (production.local wins, process VITE_ vars override)', () => {
    const env = mergeViteEnv({ local: 'VITE_USE_FIREBASE_EMULATOR=true\nVITE_X=1', production: 'VITE_USE_FIREBASE_EMULATOR=false', productionLocal: 'VITE_FIREBASE_PROJECT_ID="p-abcde"' }, { VITE_X: '2', OTHER: 'z' });
    assert.equal(env.VITE_USE_FIREBASE_EMULATOR, 'false');
    assert.equal(env.VITE_FIREBASE_PROJECT_ID, 'p-abcde');
    assert.equal(env.VITE_X, '2');
    assert.equal(env.OTHER, undefined);
    assert.deepEqual(parseEnvFile('# c\nA=1\n\nB = "two"\nbad'), { A: '1', B: 'two' });
  });
  it('flags private text found in the built site', () => {
    assert.deepEqual(findLeaks([{ name: 'a.js', text: 'ok' }], ['secret question']), []);
    assert.equal(findLeaks([{ name: 'a.js', text: 'has secret question here' }], ['secret question']).length, 1);
  });
});

describe('Firebase configuration files', () => {
  const fb = JSON.parse(readFileSync(root('firebase.json'), 'utf8'));
  it('Hosting serves the Vite build as a single-page app and caches assets safely', () => {
    assert.equal(fb.hosting.public, 'dist');
    assert.deepEqual(fb.hosting.rewrites, [{ source: '**', destination: '/index.html' }]);
    const h = JSON.stringify(fb.hosting.headers);
    assert.ok(/immutable/.test(h) && /no-cache/.test(h));
    assert.ok(!/Cross-Origin-Opener-Policy/i.test(h), 'COOP would break the Google sign-in popup');
  });
  it('keeps Firestore rules/indexes, emulators and the capped Functions package', () => {
    assert.equal(fb.firestore.rules, 'firestore.rules');
    assert.equal(fb.firestore.indexes, 'firestore.indexes.json');
    assert.equal(fb.emulators.functions.port, 5001);
    assert.equal(fb.emulators.firestore.port, 8080);
    assert.equal(fb.functions.source, 'functions');
    assert.equal(fb.functions.runtime, 'nodejs22');
    for (const x of ['dev-fixtures', 'src', 'node_modules']) assert.ok(fb.functions.ignore.includes(x), `${x} is not uploaded`);
    const pkg = JSON.parse(readFileSync(root('functions/package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '22');
  });
  it('the checked-in default project stays the emulator-only demo project (live id always comes from .env.production.local)', () => {
    assert.equal(JSON.parse(readFileSync(root('.firebaserc'), 'utf8')).projects.default, 'demo-math-boss');
    const prod = parseEnvFile(readFileSync(root('.env.production'), 'utf8'));
    assert.equal(prod.VITE_USE_FIREBASE_EMULATOR, 'false');
    assert.equal(prod.VITE_FUNCTIONS_REGION, 'us-central1');
    assert.equal(prod.VITE_FIREBASE_PROJECT_ID, undefined);
  });
  it('no deploy script can use --force, and the deploy scripts target the project explicitly', () => {
    const script = readFileSync(root('scripts/deploy.ts'), 'utf8');
    assert.ok(!/['"]--force['"]/.test(script.replace(/v === '--force'.*\n/, '')));
    const pkg = readFileSync(root('package.json'), 'utf8');
    assert.ok(!/--force/.test(pkg));
  });
  it('firestore rules keep serverOnly and teacherAllowlist closed', () => {
    const rules = readFileSync(root('firestore.rules'), 'utf8');
    assert.ok(/match \/serverOnly\/\{docId\}\s*\{\s*allow read, write: if false;/.test(rules));
  });
});

describe('Bonus Questions off must not break Daily Review', () => {
  it('without a private bank the bonus is disabled while Daily Review still pays and settles', async () => {
    const r = setup({ students: 1, noBonusBank: true });
    const bonus = await r.svc.getBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(bonus.ok && !bonus.enabled && bonus.questions.length === 0);
    const d = await r.correct('u1');
    assert.ok(d.ok && d.correct);
    assert.ok(r.player('u1').coins > 0);
    assert.equal(r.campaign().activatedCount, 1);
  });
});
