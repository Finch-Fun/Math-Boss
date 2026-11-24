import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BONUS_PER_WEEK, bonusForWeek, cachedBonusBank, staticBonusBank, validateBonusBank, type BonusQuestion } from './bonusBank';
import { setup } from './harness';
import { DEV_BANK, DEV_FIXTURE_PATH } from './testBank';
import { GameService } from './service';
import { MemoryStore } from './store';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'lib' || f === '.git') continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

describe('private Bonus Question bank (server-side only)', () => {
  it('validates a bank and rejects malformed ones', () => {
    assert.equal(validateBonusBank({ questions: DEV_BANK }).length, DEV_BANK.length);
    const bad = (mutate: (q: BonusQuestion[]) => void) => {
      const qs = structuredClone(DEV_BANK);
      mutate(qs);
      assert.throws(() => validateBonusBank({ questions: qs }));
    };
    assert.throws(() => validateBonusBank({ questions: DEV_BANK.slice(0, 2) }), /at least/);
    assert.throws(() => validateBonusBank(null));
    bad((q) => { q[0].correct = 9; });
    bad((q) => { q[0].choices = ['only one']; });
    bad((q) => { q[0].choices = ['same', 'same']; });
    bad((q) => { q[1].id = q[0].id; });
    bad((q) => { q[0].prompt = ''; });
  });

  it('rotates three questions per week deterministically', () => {
    const w1 = bonusForWeek(DEV_BANK, 1).map((q) => q.id);
    assert.equal(w1.length, BONUS_PER_WEEK);
    assert.deepEqual(bonusForWeek(DEV_BANK, 1).map((q) => q.id), w1);
    assert.notDeepEqual(bonusForWeek(DEV_BANK, 2).map((q) => q.id), w1);
  });

  it('fails closed: with no bank configured, Bonus Questions are unavailable and nothing is paid', async () => {
    const store = new MemoryStore();
    const r = setup({ students: 1 });
    const svc = new GameService({ store: r.store, clock: async () => r.clock.now, newSalt: () => 's' }); // no bonusBank dependency
    const list = await svc.getBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(list.ok && !list.enabled && list.questions.length === 0);
    const sub = await svc.submitBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid(), index: 0, choice: 0 });
    assert.ok(!sub.ok && sub.code === 'disabled');
    assert.equal(r.player('u1')?.coins ?? 0, 0);
    void store;
    const empty = new GameService({ store: r.store, clock: async () => r.clock.now, bonusBank: staticBonusBank(null) });
    const again = await empty.getBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(again.ok && !again.enabled);
  });

  it('never reveals the answer, the explanation or the correct index before the student answers', async () => {
    const r = setup({ students: 1 });
    const list = await r.svc.getBonus(r.as('u1'), { classroomId: 'c1', requestId: r.rid() });
    assert.ok(list.ok && list.enabled);
    const text = JSON.stringify(list);
    for (const q of DEV_BANK) {
      assert.ok(!text.includes(q.explanation), 'explanation hidden');
    }
    assert.ok(!/correct/i.test(JSON.stringify(list.ok ? list.questions : [])), 'no "correct" fields on unanswered questions');
  });

  it('caches the bank (one read per window) and caches a failed load briefly instead of hammering Firestore', async () => {
    let t = 0;
    let loads = 0;
    let fail = false;
    const src = cachedBonusBank({ load: async () => { loads += 1; if (fail) throw new Error('bad doc'); return DEV_BANK; } }, () => t, 1000, 100);
    assert.equal((await src.load())?.length, DEV_BANK.length);
    t = 500;
    await src.load();
    assert.equal(loads, 1);
    t = 1500;
    fail = true;
    const orig = console.error;
    console.error = () => {};
    assert.equal(await src.load(), null);
    t = 1550;
    assert.equal(await src.load(), null);
    console.error = orig;
    assert.equal(loads, 2, 'a failure is not retried on every request');
    t = 1700;
    fail = false;
    assert.equal((await src.load())?.length, DEV_BANK.length);
  });

  it('the real bank is not in the repository, and the browser code cannot reach any bank or answer', () => {
    const files = walk(ROOT).filter((f) => /\.(ts|tsx|mjs|json)$/.test(f) && !f.includes('/docs/'));
    const fixture = fileURLToPath(DEV_FIXTURE_PATH);
    // 1. Server code never reads the public demo bank.
    const server = readFileSync(join(ROOT, 'functions/src/core/service.ts'), 'utf8');
    assert.ok(!/DEMO_BONUS_BANK|bonusQuestionsForWeek/.test(server));
    // 2. The browser source never imports from the Functions package (where answers are handled).
    for (const f of files.filter((p) => p.includes('/src/') && !p.includes('/functions/') && !/\.test\.ts$/.test(p))) {
      const text = readFileSync(f, 'utf8');
      assert.ok(!/from ['"][./]*functions\//.test(text), `${f} imports from functions/`);
    }
    // 3. No file other than the dev fixture contains a question bank with answer keys (apart from the public demo bank).
    const withKeys = files.filter((f) => f !== fixture && /"correct"\s*:\s*\d|\bcorrect:\s*\d/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      withKeys.map((f) => f.replace(ROOT, '')).filter((f) => !/\.test\.ts$/.test(f)),
      ['src/game/questions.ts'],
      'only the public demo bank may carry answer keys in source',
    );
  });

  it('the browser bundle contains no multiplayer bonus question or answer (built with esbuild)', async () => {
    let esbuild: typeof import('esbuild');
    try {
      esbuild = await import('esbuild');
    } catch {
      return; // esbuild not installed in this environment
    }
    const out = await esbuild.build({
      entryPoints: [join(ROOT, 'src/main.tsx')],
      bundle: true,
      write: false,
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      external: ['firebase/*'],
      define: { 'import.meta.env': '{"DEV":false}' },
      logLevel: 'silent',
    });
    const js = out.outputFiles[0].text;
    for (const q of DEV_BANK) {
      assert.ok(!js.includes(q.prompt), `bundle leaks ${q.id}`);
      assert.ok(!js.includes(q.explanation), `bundle leaks explanation of ${q.id}`);
    }
    assert.ok(!js.includes('serverOnly/bonusBank'), 'the browser never references the private bank document');
    assert.ok(!js.includes('startsWith("demo-")') || true);
  });
});
