// Developer tools must be a build-time feature. Static checks always run; the bundle check runs when esbuild is installed
// (it ships with Vite, so it runs after `npm install`).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { toPosix } from '../testSupport/paths';

const root = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = toPosix(join(dir, n));
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
const sources = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'));

test('developer tools are gated only by the build flag, via a lazy import nothing else can reach', () => {
  const devTools = read('src/ui/devTools.tsx');
  assert.match(devTools, /import\.meta\.env\.DEV \? lazy\(\(\) => import\('\.\/DevPanel'\)\) : null/);
  assert.ok(!/role|uid|user|firestore|claims/i.test(devTools.replace(/\/\*\*[\s\S]*?\*\//, '')), 'no user/role input');
  for (const f of sources) {
    const text = read(f);
    if (f !== 'src/ui/devTools.tsx') assert.ok(!/from '\.\/DevPanel'|import\('\.\/DevPanel'\)/.test(text), `${f} must not import DevPanel directly`);
    if (!['src/ui/DevPanel.tsx', 'src/game/dev.ts'].includes(f) && !f.startsWith('src/sim/')) {
      assert.ok(!/game\/dev'/.test(text), `${f} must not import game/dev`);
    }
  }
  // only the local demo hands developer tools to the workspace
  const withDevTools = sources.filter((f) => /devTools=\{/.test(read(f)));
  assert.deepEqual(withDevTools, ['src/ui/App.tsx']);
});

test('local game views cannot reach Firebase or the cloud services', () => {
  for (const f of ['src/ui/GameWorkspace.tsx', 'src/ui/StudentView.tsx', 'src/ui/TeacherView.tsx', 'src/ui/DevPanel.tsx', 'src/ui/useGame.ts']) {
    const imports = [...read(f).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) {
      assert.ok(!/firebase|firebaseCloud|cloud\/(types|model)/.test(i), `${f} imports ${i}`);
      if (/cloud\//.test(i)) assert.ok(/cloud\/access$/.test(i), `${f}: only the pure access rules may be imported (${i})`);
    }
  }
});

test('production bundle excludes developer controls; development bundle includes them', async (t) => {
  let esbuild: { build(opts: object): Promise<{ outputFiles: { text: string }[] }> };
  try {
    esbuild = createRequire(import.meta.url)('esbuild');
  } catch {
    t.skip('esbuild is not installed here (it comes with Vite): run `npm install` and rerun to execute this check');
    return;
  }
  const bundle = async (dev: boolean): Promise<string> => {
    const out = await esbuild.build({
      entryPoints: [join(root, 'src/main.tsx')],
      bundle: true,
      write: false,
      format: 'esm',
      splitting: true,
      outdir: join(root, '.tmp-bundle-check'),
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      external: ['firebase/*'],
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': String(dev), 'import.meta.env.PROD': String(!dev) },
      logLevel: 'silent',
    });
    return out.outputFiles.map((f) => f.text).join('\n');
  };
  const markers = ['Developer simulation tools', 'devGrantCoins', 'Developer (simulation)'];
  const prod = await bundle(false);
  for (const m of markers.slice(0, 2)) assert.ok(!prod.includes(m), `production bundle must not contain "${m}"`);
  assert.ok(!prod.includes('+100,000 coins'));
  const dev = await bundle(true);
  assert.ok(dev.includes(markers[0]) && dev.includes(markers[1]), 'development bundle keeps the tools');
});
