import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings } from '../game/sample';
import {
  GRADE_LEVELS,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  formatJoinCode,
  generateJoinCode,
  normalizeJoinCode,
  validateClassroomInput,
  validateDisplayName,
  validateSettings,
} from './validation';

test('join codes use only the unambiguous alphabet and have the fixed length', () => {
  assert.equal(JOIN_CODE_ALPHABET.length, 31);
  for (const bad of '01OIL') assert.ok(!JOIN_CODE_ALPHABET.includes(bad));
  for (let i = 0; i < 200; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, JOIN_CODE_LENGTH);
    assert.ok([...code].every((c) => JOIN_CODE_ALPHABET.includes(c)), code);
  }
});

test('join code generation rejects biased bytes and is deterministic for given randomness', () => {
  // 248..255 would bias the first symbols (256 % 31 = 8), so they are skipped.
  const bytes = new Uint8Array([255, 254, 248, ...Array.from({ length: 13 }, (_, i) => i)]);
  const code = generateJoinCode(() => bytes);
  assert.equal(code, [...Array(8).keys()].map((i) => JOIN_CODE_ALPHABET[i]).join(''));
  assert.equal(generateJoinCode(() => bytes), code);
});

test('normalizeJoinCode accepts typed variations and rejects anything that cannot be a code', () => {
  const code = generateJoinCode(() => new Uint8Array(16).fill(5));
  assert.equal(normalizeJoinCode(formatJoinCode(code).toLowerCase()), code);
  assert.equal(normalizeJoinCode(`  ${code.slice(0, 4)} ${code.slice(4)} `), code);
  assert.equal(normalizeJoinCode('ABC'), null);
  assert.equal(normalizeJoinCode('ABCD-EFG0'), null); // 0 is not in the alphabet
  assert.equal(normalizeJoinCode('../classrooms/x'), null); // a code can never be used as a path
});

test('student nicknames: short, plain, no contact details', () => {
  assert.deepEqual(validateDisplayName('  Star   Fox  '), { ok: true, value: 'Star Fox' });
  assert.equal(validateDisplayName('A').ok, false);
  assert.equal(validateDisplayName('x'.repeat(25)).ok, false);
  assert.equal(validateDisplayName('kid@school.org').ok, false);
  assert.equal(validateDisplayName('<script>').ok, false);
  assert.equal(validateDisplayName("Zoë O'Neil-2").ok, true);
});

test('creating a classroom needs only a name; the rest uses the game design defaults', () => {
  const r = validateClassroomInput({ name: '  Room 12  Math ' }, 'America/Chicago');
  assert.ok(r.ok);
  assert.equal(r.value.name, 'Room 12 Math');
  assert.equal(r.value.gradeLevel, 'Mixed');
  assert.equal(r.value.timezone, 'America/Chicago');
  assert.equal(r.value.joinApproval, 'teacher'); // teacher approval is the secure default
  assert.deepEqual(r.value.settings, defaultSettings());
});

test('classroom input rejects bad names, grades, timezones and settings', () => {
  assert.equal(validateClassroomInput({ name: '   ' }).ok, false);
  assert.equal(validateClassroomInput({ name: 'x'.repeat(61) }).ok, false);
  assert.equal(validateClassroomInput({ name: 'ok', gradeLevel: '13' }).ok, false);
  assert.equal(validateClassroomInput({ name: 'ok', timezone: 'Mars/Olympus' }).ok, false);
  assert.equal(validateClassroomInput({ name: 'ok', settings: { dailyQuestions: [10, 10, 10, 10, 10, 0] } }).ok, false);
  assert.equal(validateClassroomInput({ name: 'ok', settings: { dailyQuestions: [21, 0, 0, 0, 0, 0, 0] } }).ok, false);
  assert.equal(validateClassroomInput({ name: 'ok', settings: { skills: [] } }).ok, false);
  assert.ok(GRADE_LEVELS.includes('K') && GRADE_LEVELS.includes('Mixed'));
});

test('settings validation de-duplicates skills and copies arrays', () => {
  const s = { ...defaultSettings(), skills: ['addition' as const, 'addition' as const] };
  const r = validateSettings(s);
  assert.ok(r.ok);
  assert.deepEqual(r.value.skills, ['addition']);
  assert.notEqual(r.value.dailyQuestions, s.dailyQuestions);
});

test('default classroom settings match the prototype game defaults exactly (no balance change)', () => {
  const d = defaultSettings();
  assert.deepEqual(d.dailyQuestions, [10, 10, 10, 10, 10, 0, 0]);
  assert.equal(d.bossDifficulty, 'normal');
  assert.equal(d.difficultyPreset, 'balanced');
  assert.equal(d.bonusEnabled, true);
  assert.equal(d.requireMathForUpgrades, false);
});
