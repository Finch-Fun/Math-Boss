import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { relPosix, textLines } from '../testSupport/paths';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const src = (dir: string) => walk(join(ROOT, dir)).filter((f) => !/\.test\.ts$/.test(f)).map((f) => ({ name: relPosix(ROOT, f), text: readFileSync(f, 'utf8') }));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const VISUAL = [...src('src/battlefield'), ...src('src/ui/game')];

describe('the animated battlefield is purely visual', () => {
  it('cannot reach Firebase, the cloud layer or the network, so no animation can write or settle anything', () => {
    for (const f of VISUAL) {
      assert.ok(!/from ['"][./]*(\.\.\/)*cloud\/|from ['"]firebase|httpsCallable|setDoc|updateDoc|addDoc|runTransaction|\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(f.text), `${f.name} must not touch Firebase or the network`);
    }
  });
  it('uses no randomness or wall-clock reads at render time (positions and timing derive from identity)', () => {
    for (const f of VISUAL) assert.ok(!/Math\.random|Date\.now|new Date\(/.test(stripComments(f.text)), `${f.name} must be deterministic`);
  });
  it('does not drive animation with React state per frame (no timers loops or requestAnimationFrame)', () => {
    for (const f of VISUAL) assert.ok(!/requestAnimationFrame|setInterval/.test(f.text), `${f.name} must use CSS animation, not a JS frame loop`);
  });
  it('is not given a way to change combat: it never imports the game engine mutators', () => {
    for (const f of VISUAL) assert.ok(!/from ['"][./]*(\.\.\/)*game\/(engine|dev|sample)['"]/.test(f.text), `${f.name} reads state only`);
  });
  it('character and boss art is original inline SVG: no external images or fonts', () => {
    for (const f of src('src/battlefield/art')) assert.ok(!/https?:\/\/(?!www\.w3\.org)|<image|href=|url\(['"]?http/.test(f.text), `${f.name} must not load external assets`);
    const css = read('src/battlefield/battlefield.css') + read('src/theme.css');
    assert.ok(!/@import|url\(\s*['"]?https?:/.test(css), 'no remote CSS or fonts');
  });
  it('student screens never import teacher tools or developer tools, and never list the roster', () => {
    for (const f of ['src/ui/cloud/MultiplayerStudent.tsx', 'src/ui/cloud/StudentFlow.tsx']) {
      const t = read(f);
      assert.ok(!/Teacher|DevPanel|devTools|game\/dev/.test(t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f} stays student-only`);
      assert.ok(!/listMembers|listRoster|getRoster|teacher\./.test(t), `${f} must not read the roster`);
    }
  });
});

describe('animation CSS respects accessibility and performance', () => {
  const css = read('src/battlefield/battlefield.css');
  it('honours prefers-reduced-motion by turning animations off', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  });
  it('pauses animations while the tab is hidden', () => {
    assert.match(css, /\[data-paused=['"]?true['"]?\][\s\S]*animation-play-state:\s*paused/);
  });
  it('animates transforms and opacity only (no layout-thrashing properties)', () => {
    const keyframes = [...css.matchAll(/@keyframes [\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
    assert.ok(keyframes.length > 100);
    assert.ok(!/\b(width|height|top|left|right|bottom|margin|padding)\s*:/.test(keyframes), 'keyframes must not animate layout');
  });
  it('keeps the page from scrolling sideways', () => {
    assert.match(read('src/theme.css') + css, /overflow-x:\s*(hidden|clip)|max-width:\s*100%/);
  });
});

describe('line-ending safety of source scans', () => {
  it('css and tsx sources split identically under CRLF', () => {
    assert.equal(textLines(read('src/theme.css')).some((l) => l.endsWith('\r')), false);
  });
});
