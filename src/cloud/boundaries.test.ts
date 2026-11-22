// Architecture and security-rule drift guards. These read source files, so they run without Firebase installed.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { defaultSettings } from '../game/sample';
import { classroomFields, initialPlayerFields, initialUpgrades } from './model';
import { GRADE_LEVELS, JOIN_CODE_ALPHABET, generateJoinCode, validateClassroomInput } from './validation';

const root = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((n) => {
    const rel = join(dir, n);
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}
const sources = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'));
const rules = read('firestore.rules');
const list = (src: string): string[] => [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('game logic, storage and simulator never import Firebase or the cloud layer', () => {
  for (const f of sources.filter((f) => /^src\/(game|sim|storage)\//.test(f))) {
    const text = read(f);
    assert.ok(!/from '(\.\.\/)+cloud|from 'firebase/.test(text), `${f} must stay framework- and network-free`);
  }
});

test('only firebaseCloud.ts imports the Firebase SDK, and the UI loads it lazily', () => {
  for (const f of sources) {
    const imports = /from 'firebase\//.test(read(f));
    assert.equal(imports, f === 'src/cloud/firebaseCloud.ts', f);
  }
  const app = read('src/ui/App.tsx');
  assert.ok(/lazy\(\(\) => import\('\.\/cloud\/CloudApp'\)\)/.test(app));
  assert.ok(!/^import .*CloudApp/m.test(app));
  assert.ok(/import\('\.\.\/\.\.\/cloud\/firebaseCloud'\)/.test(read('src/ui/cloud/CloudApp.tsx')));
});

test('no real credentials are committed and env files are ignored', () => {
  const env = read('.env.example');
  for (const line of env.split('\n').filter((l) => /^VITE_FIREBASE_/.test(l))) assert.match(line, /=$/, `value must be blank: ${line}`);
  const ignore = read('.gitignore');
  assert.ok(ignore.includes('.env.*') && ignore.includes('!.env.example') && ignore.includes('serviceAccount*.json'));
});

test('rules: no open access, allowlist and battle state are not client-writable', () => {
  assert.ok(!/if true/.test(rules));
  assert.match(rules, /match \/teacherAllowlist\/\{email\} \{\s*allow read, write: if false;/);
  assert.match(rules, /match \/battle\/\{docId\} \{[^}]*allow write: if false;/);
  assert.match(rules, /match \/joinCodes\/\{code\} \{\s*allow get: if signedIn\(\);\s*allow list: if false;/);
});

test('rules: player progression is create-only with zero values and there is no client role field', () => {
  const players = rules.slice(rules.indexOf('match /players/{uid}'), rules.indexOf('match /battle/'));
  assert.match(players, /allow update: if false;/);
  assert.match(players, /coins == 0/);
  assert.match(players, /lifetimeCoins == 0/);
  assert.ok(!/allow (write|update)[^;]*:\s*if (?!false)/.test(players));
  assert.ok(!/\b(role|isAdmin|isTeacher)\b\s*[:=]/.test(rules.replace(/function isTeacher\(\)/g, '')), 'no role field');
  assert.match(rules, /sign_in_provider == 'google\.com'/);
  assert.match(rules, /email_verified == true/);
});

test('rules and client stay in sync: classroom fields, settings, grades, join code, initial player', () => {
  const classroomKeys = list(rules.match(/function validClassroom\(d\) \{\s*return d\.keys\(\)\.hasOnly\(\[([^\]]+)\]/)![1]);
  const sample = validateClassroomInput({ name: 'x' });
  assert.ok(sample.ok);
  const written = Object.keys(classroomFields('uid', sample.value, 'ABCDEFGH'));
  assert.deepEqual([...classroomKeys].sort(), [...written, 'createdAt', 'updatedAt'].sort());

  const settingsKeys = list(rules.match(/function validSettings\(s\) \{[\s\S]*?hasOnly\(\[([^\]]+)\]/)![1]);
  assert.deepEqual([...settingsKeys].sort(), Object.keys(defaultSettings()).sort());

  const grades = list(rules.match(/d\.gradeLevel in \[([^\]]+)\]/)![1]);
  assert.deepEqual(grades, GRADE_LEVELS);

  const re = new RegExp(rules.match(/joinCode\.matches\('([^']+)'\)/)![1]);
  for (let i = 0; i < 300; i++) assert.match(generateJoinCode(), re);
  for (const bad of ['0', '1', 'O', 'I', 'L', 'a']) assert.ok(!re.test(`ABCDEFG${bad}`), bad);
  assert.equal([...JOIN_CODE_ALPHABET].every((c) => re.test(c.repeat(8))), true);

  const upgradeKeys = list(rules.match(/upgrades == \{([^}]+)\}/)![1].replace(/:\s*0/g, ''));
  assert.deepEqual(upgradeKeys.sort(), Object.keys(initialUpgrades()).sort());
  const playerKeys = list(rules.match(/players\/\{uid\}[\s\S]*?hasOnly\(\[([^\]]+)\]/)![1]);
  assert.deepEqual([...playerKeys].sort(), [...Object.keys(initialPlayerFields('u', 'n')), 'createdAt'].sort());
  const settingsMax = Number(rules.match(/n <= (\d+)/)![1]);
  assert.equal(settingsMax, 20);
});
