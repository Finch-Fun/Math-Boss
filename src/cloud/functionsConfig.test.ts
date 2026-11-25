import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_FUNCTIONS_REGION, functionsPlan, resolveFunctionsRegion } from './functionsConfig';
import { functionOptions } from '../../functions/src/config';

describe('browser -> Cloud Functions wiring', () => {
  it('production (emulator off) uses the configured region and never the emulator', () => {
    assert.deepEqual(functionsPlan(false, {}), { region: DEFAULT_FUNCTIONS_REGION, emulator: null });
    assert.deepEqual(functionsPlan(false, { VITE_FUNCTIONS_REGION: 'europe-west1' }), { region: 'europe-west1', emulator: null });
  });
  it('emulator mode points at 127.0.0.1:5001', () => {
    assert.deepEqual(functionsPlan(true, {}).emulator, { host: '127.0.0.1', port: 5001 });
  });
  it('invalid regions fall back to the default', () => {
    assert.equal(resolveFunctionsRegion('http://evil'), DEFAULT_FUNCTIONS_REGION);
    assert.equal(resolveFunctionsRegion(''), DEFAULT_FUNCTIONS_REGION);
  });
  it('client and server agree on the default region, and on an override', () => {
    assert.equal(functionOptions({}).region, functionsPlan(false, {}).region);
    assert.equal(functionOptions({ MATHBOSS_FUNCTIONS_REGION: 'asia-east1' }).region, functionsPlan(false, { VITE_FUNCTIONS_REGION: 'asia-east1' }).region);
  });
  it('firebaseCloud.ts follows the plan: region passed, emulator and dev clock only in emulator mode', () => {
    const src = readFileSync(new URL('./firebaseCloud.ts', import.meta.url), 'utf8');
    assert.ok(/getFunctions\(app, fnPlan\.region\)/.test(src));
    assert.ok(!/['"]us-central1['"]/.test(src), 'no hard-coded region');
    assert.ok(!/connectFunctionsEmulator\([^)]*127\.0\.0\.1/.test(src), 'functions emulator host comes from the plan');
    assert.ok(/if \(fnPlan\.emulator\) connectFunctionsEmulator\(/.test(src));
  });
});
