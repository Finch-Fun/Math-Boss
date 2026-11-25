import assert from 'node:assert/strict';
import test from 'node:test';
import { relPosix, textLines, toPosix } from './paths';

test('Windows-style paths normalize to the forward-slash form the repository checks compare against', () => {
  assert.equal(toPosix('src\\sim\\cli.ts'), 'src/sim/cli.ts');
  assert.equal(toPosix('src/sim/cli.ts'), 'src/sim/cli.ts');
  assert.equal(relPosix('C:\\repo\\math-boss\\', 'C:\\repo\\math-boss\\src\\game\\questions.ts'), 'src/game/questions.ts');
  assert.equal(relPosix('/home/x/repo/', '/home/x/repo/src/game/questions.ts'), 'src/game/questions.ts');
});

test('CRLF and LF files split into identical lines (no stray carriage returns)', () => {
  assert.deepEqual(textLines('A=\r\nB=1\r\n'), ['A=', 'B=1', '']);
  assert.deepEqual(textLines('A=\nB=1\n'), ['A=', 'B=1', '']);
});

test('the blank-credential check still rejects a filled value even with CRLF endings', () => {
  const blank = textLines('VITE_FIREBASE_API_KEY=\r\nVITE_FIREBASE_APP_ID=\r\n').filter((l) => /^VITE_FIREBASE_/.test(l));
  assert.ok(blank.every((l) => /=$/.test(l)));
  const filled = textLines('VITE_FIREBASE_API_KEY=AIzaSyFake\r\n').filter((l) => /^VITE_FIREBASE_/.test(l));
  assert.ok(!filled.every((l) => /=$/.test(l)), 'a real-looking value must still fail');
});
