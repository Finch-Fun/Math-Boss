// Renders the real UI on the server (react-dom/server) and checks what each role can see. No browser or Firebase needed.
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { practiceStorageKey } from '../cloud/mode';
import GameWorkspace from './GameWorkspace';
import type { Game } from './useGame';

before(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

// Stands in for the real DevPanel so the test can prove that even an INJECTED dev component never reaches a Firebase user.
const FakeDevTools: ComponentType<{ game: Game }> = () => createElement('p', null, 'FAKE-DEV-TOOLS');
const render = (props: Record<string, unknown>) => renderToString(createElement(GameWorkspace as unknown as ComponentType<Record<string, unknown>>, { storageKey: 'k', ...props }));
const hasTab = (html: string, view: string) => html.includes(`data-view="${view}"`);

test('student practice view: no teacher or developer navigation, even if dev tools are injected', () => {
  for (const devTools of [null, FakeDevTools]) {
    const html = render({ surface: 'student-practice', embedded: true, storageKey: practiceStorageKey('u1', 'c1'), devTools });
    assert.ok(!hasTab(html, 'teacher') && !hasTab(html, 'dev') && !hasTab(html, 'student'), 'no view switcher at all');
    assert.ok(!html.includes('aria-label="Views"'));
    assert.ok(!html.includes('FAKE-DEV-TOOLS') && !html.includes('Developer simulation'));
    assert.ok(!html.includes('Teacher activation override'), 'teacher dashboard is not mounted');
    assert.ok(html.includes('Daily Review'), 'student gameplay is shown');
  }
});

test('teacher preview inside a classroom: Student and Teacher views, never Developer', () => {
  const html = render({ surface: 'teacher-preview', embedded: true, devTools: FakeDevTools });
  assert.ok(hasTab(html, 'student') && hasTab(html, 'teacher') && !hasTab(html, 'dev'));
  assert.ok(!html.includes('FAKE-DEV-TOOLS'));
});

test('local demo keeps all views when the build includes developer tools, and drops Developer otherwise', () => {
  const dev = render({ surface: 'demo', devTools: FakeDevTools });
  assert.ok(hasTab(dev, 'student') && hasTab(dev, 'teacher') && hasTab(dev, 'dev'));
  const prod = render({ surface: 'demo', devTools: null });
  assert.ok(hasTab(prod, 'student') && hasTab(prod, 'teacher') && !hasTab(prod, 'dev'));
  assert.ok(prod.includes('Daily Review'));
});
