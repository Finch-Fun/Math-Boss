import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalStorageRepository } from '../storage/repository';
import { readFirebaseConfig } from './config';
import { CloudError, toCloudError } from './errors';
import { DEMO_STORAGE_KEY, practiceStorageKey, resolveMode } from './mode';

const FULL = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'math-boss-test',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

test('without credentials the app stays in demo mode and reports what is missing', () => {
  const m = resolveMode({});
  assert.equal(m.available, 'demo');
  assert.deepEqual(m.missing.sort(), ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID']);
  assert.equal(resolveMode({ ...FULL, VITE_FIREBASE_API_KEY: '   ' }).available, 'demo'); // blank counts as missing
});

test('a complete configuration enables Firebase mode', () => {
  const m = resolveMode(FULL);
  assert.equal(m.available, 'firebase');
  const cfg = readFirebaseConfig(FULL);
  assert.ok(cfg.ok && !cfg.useEmulator && cfg.config.projectId === 'math-boss-test');
});

test('emulator mode needs no real credentials and defaults to a demo- project id', () => {
  const cfg = readFirebaseConfig({ VITE_USE_FIREBASE_EMULATOR: 'true' });
  assert.ok(cfg.ok && cfg.useEmulator);
  assert.equal(cfg.config.projectId, 'demo-math-boss');
  assert.equal(readFirebaseConfig({ VITE_USE_FIREBASE_EMULATOR: 'false' }).ok, false);
});

test('demo storage and per-classroom practice storage never share a key', () => {
  assert.equal(new LocalStorageRepository()['key' as never], DEMO_STORAGE_KEY);
  const keys = new Set([
    DEMO_STORAGE_KEY,
    practiceStorageKey('uidA', 'class1'),
    practiceStorageKey('uidB', 'class1'),
    practiceStorageKey('uidA', 'class2'),
    practiceStorageKey('teacher-preview', 'class1'),
  ]);
  assert.equal(keys.size, 5);
});

test('SDK errors become actionable messages', () => {
  assert.equal(toCloudError({ code: 'permission-denied' }).code, 'permission_denied');
  assert.equal(toCloudError({ code: 'unavailable' }).code, 'offline');
  assert.equal(toCloudError({ code: 'auth/operation-not-allowed' }).code, 'auth_provider_disabled');
  assert.equal(toCloudError({ code: 'auth/popup-closed-by-user' }).code, 'popup_closed');
  const own = new CloudError('invalid_code', 'nope');
  assert.equal(toCloudError(own), own);
  assert.equal(toCloudError(new Error('boom')).code, 'unknown');
});
