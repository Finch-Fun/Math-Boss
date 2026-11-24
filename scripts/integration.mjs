// Runs the emulator integration test against real Auth + Firestore + Functions emulators.
import { spawnSync } from 'node:child_process';

const b = spawnSync('node', ['functions/build.mjs'], { stdio: 'inherit', shell: true });
if (b.status !== 0) process.exit(b.status ?? 1);
const r = spawnSync(
  'npx',
  ['firebase', 'emulators:exec', '--only', 'auth,firestore,functions', '--project', 'demo-math-boss', '"node --import tsx --test firestore-tests/integration.test.ts"'],
  { stdio: 'inherit', shell: true, env: { ...process.env, MATHBOSS_ENABLE_TEST_CLOCK: 'true' } },
);
process.exit(r.status ?? 1);
