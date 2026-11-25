import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSeedArgs, planSeed } from './seedPlan';

describe('bonus bank seeding safety', () => {
  it('parses arguments and rejects unknown ones', () => {
    assert.deepEqual(parseSeedArgs(['b.json', '--project', 'p', '--live']), { file: 'b.json', emulator: false, live: true, project: 'p' });
    assert.throws(() => parseSeedArgs(['--wat']));
  });
  it('requires a file and exactly one target', () => {
    assert.throws(() => planSeed(parseSeedArgs(['--emulator']), false), /bank file/);
    assert.throws(() => planSeed(parseSeedArgs(['b.json']), false), /exactly one/);
    assert.throws(() => planSeed(parseSeedArgs(['b.json', '--emulator', '--live', '--project', 'p']), false), /exactly one/);
  });
  it('live needs an explicit non-demo project and a non-dev bank', () => {
    assert.throws(() => planSeed(parseSeedArgs(['b.json', '--live']), false), /--project/);
    assert.throws(() => planSeed(parseSeedArgs(['b.json', '--live', '--project', 'demo-x']), false), /emulator-only/);
    assert.throws(() => planSeed(parseSeedArgs(['b.json', '--live', '--project', 'real']), true), /devOnly/);
    assert.deepEqual(planSeed(parseSeedArgs(['b.json', '--live', '--project', 'real']), false), { target: 'live', project: 'real' });
  });
  it('the dev fixture can go to the emulator only', () => {
    assert.deepEqual(planSeed(parseSeedArgs(['b.json', '--emulator']), true), { target: 'emulator', project: 'demo-math-boss' });
  });
});
