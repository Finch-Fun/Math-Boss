// Shared helpers for tests. Dates use the local timezone so tests do not depend on the machine's TZ.
import { HOUR } from './constants';
import { currentDailyQuestion } from './actions';
import { getStudent } from './core';
import { createGame } from './sample';
import type { GameState } from './types';

/** Monday, January 5, 2026, 8:00 AM local time. */
export const MONDAY_8AM = new Date(2026, 0, 5, 8, 0, 0).getTime();

export function makeGame(opts: { students?: number; bots?: boolean } = {}): GameState {
  return createGame({ now: MONDAY_8AM, studentCount: opts.students ?? 25, botsEnabled: opts.bots ?? false });
}

export const hours = (n: number): number => n * HOUR;

/** The correct (or deliberately wrong) raw answer for a student's current Daily Review question. */
export function answerFor(s: GameState, studentId: string, correct: boolean): string {
  const q = currentDailyQuestion(s, getStudent(s, studentId));
  if (!q) throw new Error('no question available');
  return String(correct ? q.answer : q.answer + 1);
}
