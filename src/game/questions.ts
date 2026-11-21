import { BONUS_PER_WEEK, DIFFICULTY_PRESETS } from './constants';
import { pick, randInt as ri, rngFor } from './rng';
import type { DifficultyPreset, QuestionDifficulty, SkillKey } from './types';

type Rng = () => number;

export const ALL_SKILLS: SkillKey[] = ['addition', 'subtraction', 'multiplication', 'division', 'fractions', 'missing'];
export const SKILL_LABELS: Record<SkillKey, string> = {
  addition: 'Addition',
  subtraction: 'Subtraction',
  multiplication: 'Multiplication',
  division: 'Division',
  fractions: 'Fractions of a number',
  missing: 'Missing numbers',
};

export interface Question {
  id: string;
  skill: SkillKey;
  difficulty: QuestionDifficulty;
  type: 'numeric' | 'choice';
  prompt: string;
  answer: number;
  choices?: number[];
  hints: [string, string, string];
}

interface Core {
  prompt: string;
  answer: number;
  hint1: string;
  hint2: string;
}

function placeParts(n: number): number[] {
  const parts: number[] = [];
  let p = 1;
  let m = n;
  while (m > 0) {
    const digit = m % 10;
    if (digit) parts.unshift(digit * p);
    m = Math.floor(m / 10);
    p *= 10;
  }
  return parts.length ? parts : [0];
}

function chain(start: number, parts: number[], op: '+' | '-'): string {
  let cur = start;
  const steps: string[] = [];
  for (const p of parts) {
    const next = op === '+' ? cur + p : cur - p;
    steps.push(`${cur} ${op === '+' ? '+' : '−'} ${p} = ${next}`);
    cur = next;
  }
  return steps.join(', then ');
}

const TEMPLATES: Record<SkillKey, (rng: Rng, d: QuestionDifficulty) => Core> = {
  addition(rng, d) {
    const [a, b] =
      d === 'easy'
        ? [ri(rng, 11, 59), ri(rng, 11, 39)]
        : d === 'medium'
          ? [ri(rng, 120, 899), ri(rng, 110, 599)]
          : [ri(rng, 1200, 8999), ri(rng, 1100, 5999)];
    const parts = placeParts(b);
    return {
      prompt: `${a} + ${b} = ?`,
      answer: a + b,
      hint1: 'Line up the digits by place value. Add the ones first, then the tens, and so on.',
      hint2: `Break ${b} into ${parts.join(' + ')}. Start at ${a}: ${chain(a, parts, '+')}.`,
    };
  },
  subtraction(rng, d) {
    const [b, x] =
      d === 'easy'
        ? [ri(rng, 11, 49), ri(rng, 11, 49)]
        : d === 'medium'
          ? [ri(rng, 110, 499), ri(rng, 110, 499)]
          : [ri(rng, 1100, 4999), ri(rng, 1100, 4999)];
    const a = b + x;
    const parts = placeParts(b);
    return {
      prompt: `${a} − ${b} = ?`,
      answer: x,
      hint1: 'Subtraction finds the difference. Subtract one place value at a time, regrouping when a digit is too small.',
      hint2: `Break ${b} into ${parts.join(' + ')}. Start at ${a}: ${chain(a, parts, '-')}.`,
    };
  },
  multiplication(rng, d) {
    if (d === 'easy') {
      const a = ri(rng, 2, 9);
      const b = ri(rng, 2, 9);
      const list = Array.from({ length: b }, (_, i) => a * (i + 1));
      return {
        prompt: `${a} × ${b} = ?`,
        answer: a * b,
        hint1: 'Think of multiplication as equal groups.',
        hint2: `Count by ${a}s, ${b} times: ${list.join(', ')}.`,
      };
    }
    const a = d === 'medium' ? ri(rng, 12, 49) : ri(rng, 12, 39);
    const b = d === 'medium' ? ri(rng, 3, 9) : ri(rng, 12, 29);
    const split = d === 'medium' ? a : b; // split the number we break into tens and ones
    const other = d === 'medium' ? b : a;
    const parts = placeParts(split);
    const products = parts.map((p) => p * other);
    return {
      prompt: `${a} × ${b} = ?`,
      answer: a * b,
      hint1: 'Break the bigger number into tens and ones, multiply each part, then add the pieces.',
      hint2: `${parts.map((p, i) => `${p} × ${other} = ${products[i]}`).join(', ')}. Add them: ${products.join(' + ')} = ${a * b}.`,
    };
  },
  division(rng, d) {
    const [dv, q] =
      d === 'easy' ? [ri(rng, 2, 9), ri(rng, 2, 9)] : d === 'medium' ? [ri(rng, 3, 9), ri(rng, 12, 49)] : [ri(rng, 11, 19), ri(rng, 12, 39)];
    const n = dv * q;
    const tens = Math.floor(q / 10) * 10;
    return {
      prompt: `${n} ÷ ${dv} = ?`,
      answer: q,
      hint1: 'Division undoes multiplication. Ask: what number times the divisor makes the total?',
      hint2:
        tens === 0
          ? `Think of the ${dv} times table: ${dv} × ${q} = ${n}, so ${n} ÷ ${dv} = ${q}.`
          : `${dv} × ${tens} = ${dv * tens}. That leaves ${n - dv * tens}, and ${n - dv * tens} ÷ ${dv} = ${q - tens}. So ${tens} + ${q - tens} = ${q}.`,
    };
  },
  fractions(rng, d) {
    let n: number;
    let den: number;
    let k: number;
    if (d === 'easy') {
      n = 1;
      den = pick(rng, [2, 3, 4, 5]);
      k = ri(rng, 2, 9);
    } else if (d === 'medium') {
      den = pick(rng, [3, 4, 5, 6, 8]);
      n = ri(rng, 2, den - 1);
      k = ri(rng, 2, 12);
    } else {
      den = pick(rng, [6, 8, 9, 12]);
      n = ri(rng, 2, den - 1);
      k = ri(rng, 5, 15);
    }
    const whole = den * k;
    return {
      prompt: `What is ${n}/${den} of ${whole}?`,
      answer: k * n,
      hint1: 'Divide the whole number by the bottom number (denominator) to find one part. Then multiply by the top number (numerator).',
      hint2: `${whole} ÷ ${den} = ${k}. Then ${k} × ${n} = ${k * n}.`,
    };
  },
  missing(rng, d) {
    if (d === 'easy') {
      const a = ri(rng, 5, 30);
      const x = ri(rng, 5, 30);
      return {
        prompt: `? + ${a} = ${a + x}`,
        answer: x,
        hint1: 'Use the opposite operation to find the missing number.',
        hint2: `${a + x} − ${a} = ${x}.`,
      };
    }
    if (d === 'medium') {
      const a = ri(rng, 3, 9);
      const x = ri(rng, 3, 15);
      return {
        prompt: `${a} × ? = ${a * x}`,
        answer: x,
        hint1: 'Use the opposite operation to find the missing number.',
        hint2: `${a * x} ÷ ${a} = ${x}.`,
      };
    }
    const a = ri(rng, 3, 12);
    const b = ri(rng, 3, 15);
    return {
      prompt: `? ÷ ${a} = ${b}`,
      answer: a * b,
      hint1: 'Use the opposite operation to find the missing number.',
      hint2: `${b} × ${a} = ${a * b}.`,
    };
  },
};

function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeChoices(rng: Rng, answer: number): number[] {
  const candidates = [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, answer - 2, answer * 2, answer + 5, answer - 5, answer + 100];
  const unique = [...new Set(candidates.filter((c) => c > 0 && c !== answer))];
  const chosen = shuffle(rng, unique).slice(0, 3);
  chosen.push(answer);
  return shuffle(rng, chosen);
}

function pickDifficulty(rng: Rng, preset: DifficultyPreset): QuestionDifficulty {
  const w = DIFFICULTY_PRESETS[preset];
  const r = rng();
  if (r < w.easy) return 'easy';
  if (r < w.easy + w.medium) return 'medium';
  return 'hard';
}

/** Deterministic: the same student/week/index always yields the same question (survives refresh). */
export function generateDailyQuestion(opts: {
  studentId: string;
  weekIndex: number;
  index: number;
  preset: DifficultyPreset;
  skills: SkillKey[];
}): Question {
  const rng = rngFor('daily', opts.studentId, opts.weekIndex, opts.index);
  const skills = opts.skills.length ? opts.skills : ALL_SKILLS;
  const skill = pick(rng, skills);
  const difficulty = pickDifficulty(rng, opts.preset);
  const core = TEMPLATES[skill](rng, difficulty);
  let example = TEMPLATES[skill](rng, difficulty);
  for (let i = 0; i < 5 && example.prompt === core.prompt; i++) example = TEMPLATES[skill](rng, difficulty);
  const hint3 = `Here is a similar problem with different numbers: ${example.prompt}  ${example.hint2} So the answer is ${example.answer}. Now try your problem again!`;
  const type = rng() < 0.35 ? 'choice' : 'numeric';
  return {
    id: `${opts.studentId}:${opts.weekIndex}:${opts.index}`,
    skill,
    difficulty,
    type,
    prompt: core.prompt,
    answer: core.answer,
    choices: type === 'choice' ? makeChoices(rng, core.answer) : undefined,
    hints: [core.hint1, core.hint2, hint3],
  };
}

export function parseAnswer(raw: string): number | null {
  const t = raw.trim().replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** wrongCount: how many incorrect attempts so far on this question. */
export function hintFor(q: Question, wrongCount: number): string | null {
  if (wrongCount <= 0) return null;
  return q.hints[Math.min(wrongCount, 3) - 1];
}

// ---- Bonus Questions: one attempt, no hints, explanation after submission ----
export interface BonusQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
}

export const BONUS_BANK: BonusQuestion[] = [
  {
    id: 'b1',
    prompt: 'A bakery packs 12 muffins in each box. It sells 7 boxes in the morning and 5 boxes in the afternoon. How many muffins were sold?',
    choices: ['124', '144', '156', '84'],
    correct: 1,
    explanation: '7 + 5 = 12 boxes, and 12 × 12 = 144 muffins.',
  },
  {
    id: 'b2',
    prompt: 'Maya has $50. She buys 3 notebooks for $4 each and a backpack for $23. How much money does she have left?',
    choices: ['$11', '$15', '$19', '$27'],
    correct: 1,
    explanation: '3 × 4 = 12, then 12 + 23 = 35 spent. 50 − 35 = 15.',
  },
  {
    id: 'b3',
    prompt: 'A rectangle is 9 cm long and 6 cm wide. A square has the same perimeter. What is the side length of the square?',
    choices: ['7 cm', '7.5 cm', '8 cm', '15 cm'],
    correct: 1,
    explanation: 'The rectangle perimeter is 2 × (9 + 6) = 30 cm. A square has 4 equal sides, so 30 ÷ 4 = 7.5 cm.',
  },
  {
    id: 'b4',
    prompt: 'A train travels 45 miles each hour for 4 hours, then 30 miles each hour for 2 hours. How far does it travel in total?',
    choices: ['195 miles', '210 miles', '240 miles', '270 miles'],
    correct: 2,
    explanation: '45 × 4 = 180 and 30 × 2 = 60. 180 + 60 = 240 miles.',
  },
  {
    id: 'b5',
    prompt: 'Sam read 3/5 of a 150-page book. How many pages are left to read?',
    choices: ['30', '60', '90', '120'],
    correct: 1,
    explanation: '150 ÷ 5 = 30, and 30 × 3 = 90 pages read. 150 − 90 = 60 pages left.',
  },
  {
    id: 'b6',
    prompt: 'Tickets cost $8 for kids and $12 for adults. A group buys 5 kid tickets and 3 adult tickets. What is the total cost?',
    choices: ['$64', '$76', '$88', '$96'],
    correct: 1,
    explanation: '5 × 8 = 40 and 3 × 12 = 36. 40 + 36 = $76.',
  },
  {
    id: 'b7',
    prompt: 'A tank holds 240 liters and is 3/8 full. How many more liters are needed to fill it?',
    choices: ['90', '120', '150', '210'],
    correct: 2,
    explanation: '240 ÷ 8 = 30, and 30 × 3 = 90 liters in the tank. 240 − 90 = 150 liters needed.',
  },
  {
    id: 'b8',
    prompt: 'The sum of two numbers is 56 and their difference is 12. What is the larger number?',
    choices: ['22', '28', '34', '44'],
    correct: 2,
    explanation: 'The larger number is (56 + 12) ÷ 2 = 34. The smaller is 22, and 34 + 22 = 56.',
  },
  {
    id: 'b9',
    prompt: 'A store sells pencils at 4 for $1.20. How much do 10 pencils cost?',
    choices: ['$2.40', '$3.00', '$3.60', '$4.80'],
    correct: 1,
    explanation: '$1.20 ÷ 4 = $0.30 per pencil, and 10 × $0.30 = $3.00.',
  },
];

export function bonusQuestionsForWeek(weekIndex: number): BonusQuestion[] {
  return Array.from({ length: BONUS_PER_WEEK }, (_, i) => BONUS_BANK[(weekIndex * BONUS_PER_WEEK + i) % BONUS_BANK.length]);
}
