import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_FUNCTIONS_REGION } from '../../src/cloud/functionsConfig';
import { MAX_INSTANCES, functionOptions, parseOrigins } from './config';

describe('Cloud Functions deployment options (cost guard rails)', () => {
  it('caps instances, scales to zero, bounds execution and memory', () => {
    const o = functionOptions({});
    assert.equal(o.maxInstances, MAX_INSTANCES);
    assert.ok(o.maxInstances <= 5);
    assert.equal(o.minInstances, 0);
    assert.equal(o.memory, '256MiB');
    assert.ok(o.timeoutSeconds <= 30);
  });
  it('region defaults to the client default and can be overridden; junk is ignored', () => {
    assert.equal(functionOptions({}).region, DEFAULT_FUNCTIONS_REGION);
    assert.equal(functionOptions({ MATHBOSS_FUNCTIONS_REGION: 'europe-west1' }).region, 'europe-west1');
    assert.equal(functionOptions({ MATHBOSS_FUNCTIONS_REGION: 'nope!' }).region, DEFAULT_FUNCTIONS_REGION);
  });
  it('CORS is open only when no origins are configured', () => {
    assert.equal(parseOrigins(undefined), true);
    assert.deepEqual(parseOrigins(' https://a.web.app, https://b.com ,'), ['https://a.web.app', 'https://b.com']);
    assert.deepEqual(functionOptions({ MATHBOSS_ALLOWED_ORIGINS: 'https://a.web.app' }).cors, ['https://a.web.app']);
  });
  it('index.ts uses the shared options on every callable and defines no scheduled or trigger functions', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    assert.ok(!/onSchedule|onDocument|onRequest|onTask|pubsub|onObject/.test(src));
    const calls = src.match(/onCall\(/g) ?? [];
    const withOpts = src.match(/onCall\(opts,/g) ?? [];
    assert.ok(calls.length >= 8);
    assert.equal(calls.length, withOpts.length);
    assert.ok(/functionOptions\(env\)/.test(src) || /functionOptions\(process\.env\)/.test(src));
  });
});
