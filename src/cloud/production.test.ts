import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFirebaseConfig, type Env } from './config';
import { functionsPlan } from './functionsConfig';
import { resolveMode } from './mode';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REAL = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'my-mathboss.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'my-mathboss',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

// Vite hands the app a real boolean for PROD (the Env type only models strings), so the tests cast like the app's own import.meta.env does.
const withProd = (e: object, prod: boolean) => ({ ...e, PROD: prod }) as unknown as Env;

test('a production build ignores the emulator flag: it never uses placeholder credentials or 127.0.0.1', () => {
  const env = withProd({ ...REAL, VITE_USE_FIREBASE_EMULATOR: 'true' }, true);
  const cfg = readFirebaseConfig(env);
  assert.ok(cfg.ok && !cfg.useEmulator && cfg.config.projectId === 'my-mathboss' && cfg.config.apiKey === 'k');
  assert.equal(functionsPlan(cfg.ok && cfg.useEmulator, env).emulator, null);
  // emulator flag alone in a production build is "not configured" (demo mode), never an emulator connection
  const bare = readFirebaseConfig(withProd({ VITE_USE_FIREBASE_EMULATOR: 'true' }, true));
  assert.ok(!bare.ok && !bare.useEmulator);
  assert.equal(resolveMode(withProd({ VITE_USE_FIREBASE_EMULATOR: 'true' }, true)).available, 'demo');
  // the dev server (PROD false) still supports the emulator
  const dev = readFirebaseConfig(withProd({ VITE_USE_FIREBASE_EMULATOR: 'true' }, false));
  assert.ok(dev.ok && dev.useEmulator);
});

test('production env defaults: emulator off, region matches the Functions default', () => {
  const text = readFileSync(join(ROOT, '.env.production'), 'utf8');
  assert.match(text, /^VITE_USE_FIREBASE_EMULATOR=false$/m);
  assert.match(text, /^VITE_FUNCTIONS_REGION=us-central1$/m);
});

test('the production browser bundle has no developer tools, test clock UI, or private bonus data', async () => {
  let esbuild: typeof import('esbuild');
  try {
    esbuild = await import('esbuild');
  } catch {
    return;
  }
  const out = await esbuild.build({
    entryPoints: [join(ROOT, 'src/main.tsx')],
    bundle: true,
    write: false,
    minify: true,
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['firebase/*'],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"', 'import.meta.env': '{}' },
    logLevel: 'silent',
  });
  const js = out.outputFiles.map((f) => f.text).join('\n');
  assert.ok(js.length > 1000, 'bundle was produced');
  for (const marker of ['Developer simulation tools', 'Server test clock', 'Simulation', 'emulators:dev']) {
    assert.ok(!js.includes(marker), `production bundle must not contain "${marker}"`);
  }
  assert.ok(!js.includes('serverOnly/bonusBank'));
  assert.ok(!js.includes('MATHBOSS_ENABLE_TEST_CLOCK'));
});
