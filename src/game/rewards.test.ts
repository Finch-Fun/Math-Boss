import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bonusKey, coinsForAttempts, currentDailyQuestion, dailyRemaining, submitBonusAnswer, submitDailyAnswer, updateSettings } from './actions';
import { weeklyUnlocked, getStudent } from './core';
import { advance } from './engine';
import { ALL_SKILLS, bonusQuestionsForWeek, generateDailyQuestion } from './questions';
import { answerFor, makeGame } from './testing';

test('daily reward table is 10 / 5 / 2', () => {
  assert.equal(coinsForAttempts(1), 10);
  assert.equal(coinsForAttempts(2), 5);
  assert.equal(coinsForAttempts(3), 2);
  assert.equal(coinsForAttempts(9), 2);
});

test('first-attempt correct earns 10 coins', () => {
  const s = makeGame();
  const r = submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.ok(r.ok && r.correct && r.coins === 10 && r.attempts === 1);
  assert.equal(getStudent(s, 's1').coins, 10);
});

test('second-attempt correct earns 5; wrong answers never deduct coins', () => {
  const s = makeGame();
  const wrong = submitDailyAnswer(s, 's1', answerFor(s, 's1', false));
  assert.ok(wrong.ok && !wrong.correct && wrong.hint.length > 0);
  assert.equal(getStudent(s, 's1').coins, 0);
  const right = submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.ok(right.ok && right.correct && right.coins === 5 && right.attempts === 2);
  assert.equal(getStudent(s, 's1').coins, 5);
});

test('third or later attempt earns 2 and hints escalate', () => {
  const s = makeGame();
  const hints: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = submitDailyAnswer(s, 's1', answerFor(s, 's1', false));
    assert.ok(r.ok && !r.correct);
    if (r.ok && !r.correct) hints.push(r.hint);
  }
  assert.equal(new Set(hints).size, 3); // basic hint, detailed hint, worked example
  const r = submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.ok(r.ok && r.correct && r.coins === 2 && r.attempts === 4);
  assert.equal(getStudent(s, 's1').coins, 2);
});

test('non-numeric input is rejected without counting as an attempt', () => {
  const s = makeGame();
  const r = submitDailyAnswer(s, 's1', 'banana');
  assert.equal(r.ok, false);
  assert.equal(getStudent(s, 's1').currentWrong, 0);
});

test('students must answer correctly before moving to the next question', () => {
  const s = makeGame();
  const st = getStudent(s, 's1');
  const first = currentDailyQuestion(s, st)!;
  submitDailyAnswer(s, 's1', answerFor(s, 's1', false));
  assert.equal(currentDailyQuestion(s, st)!.id, first.id); // still the same question
  submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.notEqual(currentDailyQuestion(s, st)!.id, first.id);
  assert.equal(st.weekQuestions, 1);
});

test('questions unlock by day and cannot exceed what is assigned', () => {
  const s = makeGame();
  assert.equal(weeklyUnlocked(s), 10); // Monday
  for (let i = 0; i < 10; i++) assert.ok(submitDailyAnswer(s, 's1', answerFor(s, 's1', true)).ok);
  assert.equal(dailyRemaining(s, getStudent(s, 's1')), 0);
  assert.equal(submitDailyAnswer(s, 's1', '1').ok, false);
  advance(s, new Date(2026, 0, 6, 9, 0).getTime()); // Tuesday morning
  assert.equal(weeklyUnlocked(s), 20);
  assert.equal(dailyRemaining(s, getStudent(s, 's1')), 10); // unfinished work carries over, new work unlocks
});

test('weekly activation: one correct Daily Review answer, not a wrong one', () => {
  const s = makeGame();
  assert.equal(getStudent(s, 's1').activated, false);
  submitDailyAnswer(s, 's1', answerFor(s, 's1', false));
  assert.equal(getStudent(s, 's1').activated, false);
  submitDailyAnswer(s, 's1', answerFor(s, 's1', true));
  assert.equal(getStudent(s, 's1').activated, true);
  assert.equal(getStudent(s, 's2').activated, false);
});

test('zero-question week activates every student automatically', () => {
  const s = makeGame();
  updateSettings(s, { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] });
  assert.ok(s.students.every((st) => st.activated));
  assert.ok(s.battle.nextAttackAt !== null);
});

test('zero-question rule also applies when a new week begins', () => {
  const s = makeGame();
  updateSettings(s, { dailyQuestions: [0, 0, 0, 0, 0, 0, 0] });
  advance(s, s.battle.weekEnd + 1000);
  assert.equal(s.battle.weekIndex, 2);
  assert.ok(s.students.every((st) => st.activated));
});

test('Bonus Questions: one attempt, 20 coins when correct, then locked', () => {
  const s = makeGame();
  const q = bonusQuestionsForWeek(s.battle.weekIndex)[0];
  const r = submitBonusAnswer(s, 's1', 0, q.correct);
  assert.ok(r.ok && r.correct && r.coins === 20);
  assert.equal(getStudent(s, 's1').coins, 20);
  assert.equal(submitBonusAnswer(s, 's1', 0, q.correct).ok, false); // locked
  assert.equal(getStudent(s, 's1').coins, 20);
  assert.ok(getStudent(s, 's1').bonusAnswers[bonusKey(s, 0)].correct);
});

test('Bonus Questions: incorrect earns 0 and cannot be retried', () => {
  const s = makeGame();
  const q = bonusQuestionsForWeek(s.battle.weekIndex)[1];
  const wrongChoice = (q.correct + 1) % q.choices.length;
  const r = submitBonusAnswer(s, 's1', 1, wrongChoice);
  assert.ok(r.ok && !r.correct && r.coins === 0);
  assert.equal(submitBonusAnswer(s, 's1', 1, q.correct).ok, false);
  assert.equal(getStudent(s, 's1').coins, 0);
});

test('Bonus Questions do not activate a student', () => {
  const s = makeGame();
  const q = bonusQuestionsForWeek(s.battle.weekIndex)[0];
  submitBonusAnswer(s, 's1', 0, q.correct);
  assert.equal(getStudent(s, 's1').activated, false);
});

test('generated questions are deterministic and mathematically correct', () => {
  for (let index = 0; index < 600; index++) {
    const opts = { studentId: 's1', weekIndex: 1 + (index % 7), index, preset: 'balanced' as const, skills: ALL_SKILLS };
    const q = generateDailyQuestion(opts);
    assert.deepEqual(q, generateDailyQuestion(opts));
    assert.ok(Number.isInteger(q.answer) && q.answer > 0);
    assert.ok(q.hints.every((h) => h.length > 0));
    if (q.type === 'choice') {
      assert.equal(q.choices!.length, 4);
      assert.equal(new Set(q.choices).size, 4);
      assert.equal(q.choices!.filter((c) => c === q.answer).length, 1);
    }
    let m: RegExpMatchArray | null;
    if ((m = q.prompt.match(/^(\d+) ([+−×÷]) (\d+) = \?$/))) {
      const [a, b] = [Number(m[1]), Number(m[3])];
      const expected = m[2] === '+' ? a + b : m[2] === '−' ? a - b : m[2] === '×' ? a * b : a / b;
      assert.equal(q.answer, expected, q.prompt);
    } else if ((m = q.prompt.match(/^What is (\d+)\/(\d+) of (\d+)\?$/))) {
      assert.equal(q.answer, (Number(m[3]) / Number(m[2])) * Number(m[1]), q.prompt);
    } else if ((m = q.prompt.match(/^\? \+ (\d+) = (\d+)$/))) {
      assert.equal(q.answer, Number(m[2]) - Number(m[1]), q.prompt);
    } else if ((m = q.prompt.match(/^(\d+) × \? = (\d+)$/))) {
      assert.equal(q.answer, Number(m[2]) / Number(m[1]), q.prompt);
    } else if ((m = q.prompt.match(/^\? ÷ (\d+) = (\d+)$/))) {
      assert.equal(q.answer, Number(m[1]) * Number(m[2]), q.prompt);
    } else {
      assert.fail(`unrecognized prompt: ${q.prompt}`);
    }
  }
});
