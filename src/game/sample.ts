import { CASTLE_HP_PER_STUDENT, STATE_VERSION } from './constants';
import { startNewWeek, freshStats } from './engine';
import { freshProjects } from './projects';
import { ALL_SKILLS } from './questions';
import { weekEndOf, weekStartOf } from './time';
import { emptyUpgrades } from './upgrades';
import type { GameState, Strategy, Student } from './types';

const NICKNAMES = [
  'Maple', 'Comet', 'Pixel', 'Otter', 'Juniper', 'Falcon', 'Nova', 'Biscuit', 'Ember', 'Willow', 'Orbit', 'Pepper', 'Sage',
  'Dash', 'Marble', 'Cricket', 'Fable', 'Rocket', 'Clover', 'Mochi', 'Thunder', 'Poppy', 'Ziggy', 'Basil', 'Echo',
];
const STRATEGIES: Strategy[] = ['balanced', 'damage', 'balanced', 'crit', 'donor', 'saver', 'minimal', 'balanced'];

function makeStudent(i: number, now: number): Student {
  const strategy = STRATEGIES[i % STRATEGIES.length];
  return {
    id: `s${i + 1}`,
    nickname: NICKNAMES[i] ?? `Student ${i + 1}`,
    coins: 0,
    lifetimeCoins: 0,
    upgrades: emptyUpgrades(),
    activated: false,
    weekDamage: 0,
    weekDonated: 0,
    weekQuestions: 0,
    weekFirstTry: 0,
    currentWrong: 0,
    bonusAnswers: {},
    records: [],
    bot: {
      engagement: 0.65 + (((i * 37) % 100) / 100) * 0.35,
      accuracy: 0.55 + (((i * 53) % 100) / 100) * 0.4,
      strategy,
      sessionMinute: 8 * 60 + ((i * 47) % 420),
      donatePct: strategy === 'donor' ? 0.4 : strategy === 'minimal' ? 0 : 0.15,
      lastSessionAt: now - 1,
    },
  };
}

/** A fresh sample classroom. The first student (s1) is the human player; the rest are simulated classmates. */
export function createGame(opts: { now: number; studentCount?: number; botsEnabled?: boolean }): GameState {
  const count = opts.studentCount ?? 25;
  const students = Array.from({ length: count }, (_, i) => makeStudent(i, opts.now));
  const start = weekStartOf(opts.now);
  const state: GameState = {
    version: STATE_VERSION,
    now: opts.now,
    savedAtReal: Date.now(),
    playerId: 's1',
    className: 'Room 12 (Sample Class)',
    students,
    settings: {
      requireMathForUpgrades: false,
      dailyQuestions: [10, 10, 10, 10, 10, 0, 0],
      difficultyPreset: 'balanced',
      skills: [...ALL_SKILLS],
      bossDifficulty: 'normal',
      bonusEnabled: true,
    },
    battle: {
      phase: 'combat',
      boss: null,
      bossesDefeated: 0,
      castleHp: CASTLE_HP_PER_STUDENT * count,
      baseCastleMaxHp: CASTLE_HP_PER_STUDENT * count,
      nextAttackAt: null,
      trainingEndsAt: null,
      weekIndex: 1,
      weekStart: start,
      weekEnd: weekEndOf(start),
    },
    projects: freshProjects(),
    stats: freshStats(),
    history: [],
    daySnapshot: { at: opts.now, bossPct: 0, bossNumber: 1, castlePct: 1, donated: 0, questions: 0 },
    dev: { dpsMultiplier: 1, botsEnabled: opts.botsEnabled ?? true },
    log: [],
  };
  startNewWeek(state, start, true);
  state.log.unshift({ at: opts.now, text: 'Welcome! Answer a Daily Review question to join the battle.' });
  return state;
}
