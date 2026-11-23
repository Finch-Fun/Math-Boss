// Starts the local Firebase emulators (Auth, Firestore, Functions) for Math Boss. Works the same in PowerShell, cmd and bash.
//   npm run emulators          -> normal local run
//   npm run emulators:dev      -> also enables the emulator-only test clock (never available outside the emulator)
// Safety: the project id is "demo-math-boss". Firebase treats any "demo-" project as emulator-only, so nothing here can contact or
// modify a live Firebase project, and no deployment or billing is involved.
import { spawn, spawnSync } from 'node:child_process';

const withClock = process.argv.includes('--dev-clock');
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });

console.log('Building the Cloud Functions bundle...');
const build = run('node', ['functions/build.mjs']);
if (build.status !== 0) {
  console.error('\nFunctions build failed. Did you run:  npm install  and  npm --prefix functions install ?');
  process.exit(build.status ?? 1);
}

const env = { MATHBOSS_ENABLE_TEST_CLOCK: withClock ? 'true' : '' };
console.log(withClock ? 'Test clock: ENABLED (emulator only).' : 'Test clock: disabled.');
console.log('Emulator UI: http://127.0.0.1:4000   Auth :9099   Firestore :8080   Functions :5001\n');
const child = spawn('npx', ['firebase', 'emulators:start', '--only', 'auth,firestore,functions', '--project', 'demo-math-boss'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...env },
});
child.on('exit', (code) => process.exit(code ?? 0));
