import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedViews, demoOffered, effectiveView, type Surface } from './access';

const SURFACES: Surface[] = ['demo', 'teacher-preview', 'student-practice'];

test('students get only the student gameplay view, whatever the build', () => {
  for (const dev of [false, true]) assert.deepEqual(allowedViews('student-practice', dev), ['student']);
});

test('teachers in a Firebase classroom get the Battle Report but never developer tools', () => {
  for (const dev of [false, true]) assert.deepEqual(allowedViews('teacher-preview', dev), ['student', 'teacher']);
});

test('developer tools exist only in the local demo and only when the build includes them', () => {
  assert.deepEqual(allowedViews('demo', true), ['student', 'teacher', 'dev']);
  assert.deepEqual(allowedViews('demo', false), ['student', 'teacher']);
  for (const surface of SURFACES.filter((s) => s !== 'demo')) assert.ok(!allowedViews(surface, true).includes('dev'), surface);
});

test('requested state cannot select a view the surface does not allow', () => {
  assert.equal(effectiveView('teacher', allowedViews('student-practice', true)), 'student');
  assert.equal(effectiveView('dev', allowedViews('student-practice', true)), 'student');
  assert.equal(effectiveView('dev', allowedViews('teacher-preview', true)), 'student');
  assert.equal(effectiveView('dev', allowedViews('demo', false)), 'student');
  assert.equal(effectiveView('dev', allowedViews('demo', true)), 'dev');
  assert.equal(effectiveView('teacher', allowedViews('teacher-preview', false)), 'teacher');
});

test('the demo (with its simulated Teacher view) is not offered beside real sign-in in a production Firebase build', () => {
  assert.equal(demoOffered(true, false), false);
  assert.equal(demoOffered(true, true), true); // local development
  assert.equal(demoOffered(false, false), true); // no Firebase configured: nothing to protect
  assert.equal(demoOffered(false, true), true);
});
