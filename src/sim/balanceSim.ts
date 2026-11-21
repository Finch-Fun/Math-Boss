// Balance simulator (Milestone 0 tooling). Drives the real game engine with simulated classmates and accounts for
// every hour of every campaign week. It never edits game values permanently: tuning overrides are restored afterwards.
import { HOUR, resetTuning, setTuning, type Tuning } from '../game/constants';
import { activatedCount, castleMaxHp, classDps } from '../game/core';
import { advance } from '../game/engine';
import { rngFor } from '../game/rng';
import { createGame } from '../game/sample';
import type { GameState, ProjectKey } from '../game/types';

export type PhaseKey = 'combat' | 'waiting' | 'training' | 'breach' | 'idle';
export const PHASES: PhaseKey[] = ['combat', 'waiting', 'training', 'breach', 'idle'];
export const PROJECTS: ProjectKey[] = ['walls', 'plating', 'banner', 'repairs'];

export interface RunConfig {
  students: number;
  /** Share of each session's earnings that every simulated student donates to shared projects. */
  donatePct: number;
  /** 0 = the sample classroom's profiles; other values draw a different (still deterministic) cohort. */
  seed: number;
  weeks: number;
  /** Multiplies every student's chance of showing up on a school day (participation stress test). */
  engagementScale?: number;
  /**
   * Realism: each week the whole class donates between (1 - spread) and (1 + spread) times the nominal rate,
   * and each student has a personal habit within the same range. 0 = every week identical. Default 0.5.
   */
  donationSpread?: number;
  tuning?: Partial<Tuning>;
}

export interface BossTrace {
  number: number;
  maxHp: number;
  spawnedHour: number; // hours after Monday 12:00 AM
  defeatedHour: number | null;
  combatHours: number; // hours spent in the combat phase for this boss (attack clock running)
}

export interface WeekResult {
  week: number;
  lengthHours: number;
  students: number;
  castleMaxHpBase: number;
  bosses: number; // bosses defeated
  hours: Record<PhaseKey, number>;
  bossTrace: BossTrace[];
  castleEndPct: number;
  castleMinPct: number;
  castleByDay: number[]; // castle HP share at the end of each day, Monday..Sunday
  breaches: number;
  breachStartHours: number[]; // hours after Monday 12 AM at which each breach began
  breachRecoveryHours: number[]; // completed breaches: hours from breach to combat resuming
  breachOpenAtEnd: boolean;
  /** A breach began before the week's last victory (or the class never won), so it delayed or denied progress. */
  costlyBreach: boolean;
  earned: number;
  donated: number;
  projectLevels: Record<ProjectKey, number>;
  questionRepairPct: number; // share of castle max HP restored by correct answers during breaches
  activatedPct: number;
  classDpsEnd: number;
}

const STEP = 15 * 60_000;
const START = new Date(2026, 0, 5, 0, 0, 0).getTime(); // a Monday, 12:00 AM local time

const phaseKey = (s: GameState): PhaseKey => {
  const b = s.battle;
  if (b.phase === 'combat') return b.nextAttackAt === null ? 'waiting' : 'combat';
  return b.phase;
};
const lifetimeCoins = (s: GameState): number => s.students.reduce((sum, st) => sum + st.lifetimeCoins, 0);

function buildClass(cfg: RunConfig): GameState {
  const s = createGame({ now: START, studentCount: cfg.students, botsEnabled: true });
  s.playerId = ''; // every student is simulated (in the app, s1 is the human player)
  const rng = rngFor('cohort', cfg.seed);
  s.students.forEach((st, i) => {
    if (cfg.seed > 0) {
      st.id = `c${cfg.seed}-${i}`;
      st.bot.engagement = 0.65 + rng() * 0.35;
      st.bot.accuracy = 0.55 + rng() * 0.4;
      st.bot.sessionMinute = 8 * 60 + Math.floor(rng() * 420);
    }
    st.bot.engagement = Math.min(1, st.bot.engagement * (cfg.engagementScale ?? 1));
    st.bot.donatePct = cfg.donatePct;
  });
  return s;
}

export function runScenario(cfg: RunConfig): WeekResult[] {
  resetTuning();
  setTuning(cfg.tuning ?? {});
  try {
    const s = buildClass(cfg);
    const spread = cfg.donationSpread ?? 0.5;
    const habit = s.students.map((_, i) => 1 + spread * (2 * rngFor('habit', cfg.seed, i)() - 1));
    const results: WeekResult[] = [];
    for (let w = 1; w <= cfg.weeks; w++) {
      const mood = 1 + spread * (2 * rngFor('mood', cfg.seed, w)() - 1);
      s.students.forEach((st, i) => (st.bot.donatePct = Math.max(0, cfg.donatePct * mood * habit[i])));
      results.push(runWeek(s, w));
    }
    return results;
  } finally {
    resetTuning();
  }
}

function runWeek(s: GameState, week: number): WeekResult {
  const { weekStart, weekEnd } = s.battle;
  const hours: Record<PhaseKey, number> = { combat: 0, waiting: 0, training: 0, breach: 0, idle: 0 };
  const trace = new Map<number, BossTrace>();
  const track = () => {
    const boss = s.battle.boss;
    if (boss && !trace.has(boss.number)) {
      trace.set(boss.number, { number: boss.number, maxHp: boss.maxHp, spawnedHour: (boss.spawnedAt - weekStart) / HOUR, defeatedHour: null, combatHours: 0 });
    }
  };
  track();
  const baseMax = s.battle.baseCastleMaxHp;
  const coinsStart = lifetimeCoins(s);
  let lastDefeated = 0;
  let minCastle = 1;
  let inBreach = false;
  let breachStart = 0;
  const recoveries: number[] = [];
  const breachStarts: number[] = [];
  const castleByDay: number[] = [];

  while (s.now < weekEnd - 1) {
    const step = Math.min(STEP, weekEnd - 1 - s.now);
    const key = phaseKey(s);
    const bossBefore = s.battle.boss;
    advance(s, s.now + step);
    hours[key] += step / HOUR;
    if (key === 'combat' && bossBefore) trace.get(bossBefore.number)!.combatHours += step / HOUR;
    track();
    const b = s.battle;
    while (lastDefeated < b.bossesDefeated) {
      lastDefeated += 1;
      trace.get(lastDefeated)!.defeatedHour = (s.now - weekStart) / HOUR;
    }
    minCastle = Math.min(minCastle, b.castleHp / castleMaxHp(s));
    while (castleByDay.length < 7 && s.now - weekStart >= (castleByDay.length + 1) * 24 * HOUR - 1) castleByDay.push(b.castleHp / castleMaxHp(s));
    if (b.phase === 'breach' && !inBreach) {
      inBreach = true;
      breachStart = s.now;
      breachStarts.push((s.now - weekStart) / HOUR);
    } else if (b.phase !== 'breach' && inBreach) {
      inBreach = false;
      recoveries.push((s.now - breachStart) / HOUR);
    }
  }

  const max = castleMaxHp(s);
  const lastKillHour = Math.max(-1, ...[...trace.values()].map((t) => t.defeatedHour ?? -1));
  const result: WeekResult = {
    week,
    lengthHours: (weekEnd - weekStart) / HOUR,
    students: s.students.length,
    castleMaxHpBase: baseMax,
    bosses: s.battle.bossesDefeated,
    hours,
    bossTrace: [...trace.values()],
    castleEndPct: s.battle.castleHp / max,
    castleMinPct: minCastle,
    castleByDay,
    breaches: s.stats.breaches,
    breachStartHours: breachStarts,
    breachRecoveryHours: recoveries,
    breachOpenAtEnd: inBreach,
    costlyBreach: breachStarts.some((h) => s.battle.bossesDefeated === 0 || h < lastKillHour),
    earned: lifetimeCoins(s) - coinsStart,
    donated: s.stats.donated,
    projectLevels: Object.fromEntries(PROJECTS.map((k) => [k, s.projects[k].level])) as Record<ProjectKey, number>,
    questionRepairPct: s.stats.emergencyRepairHp / max,
    activatedPct: activatedCount(s) / s.students.length,
    classDpsEnd: classDps(s),
  };
  advance(s, weekEnd); // roll over into the next campaign week
  return result;
}

// ---------- Aggregation ----------
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
function quantile(a: number[], q: number): number {
  if (!a.length) return NaN;
  const sorted = [...a].sort((x, y) => x - y);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Summary {
  n: number; // class-weeks
  bossesMean: number;
  bossDist: { zero: number; one: number; two: number; threePlus: number };
  breachWeekShare: number; // share of class-weeks with at least one breach
  costlyBreachShare: number; // share of class-weeks with a breach that delayed or denied a victory
  endedInBreachShare: number; // share of class-weeks that finished still in breach
  breachesPerWeek: number;
  castleEnd: { mean: number; p10: number; p50: number; p90: number };
  castleMinMean: number;
  castleByDay: number[]; // mean castle HP share at the end of each day, Monday..Sunday
  hours: Record<PhaseKey, number>;
  bossCombatHours: number[]; // mean for bosses 1..3 (NaN when never reached)
  bossDefeatHour: number[]; // mean hour after Monday 12 AM that bosses 1..3 fell
  recovery: { n: number; mean: number; max: number };
  donationShare: number;
  earned: number;
  projectLevels: Record<ProjectKey, number>;
  questionRepairPct: number;
  activatedPct: number;
}

export function summarize(rows: WeekResult[]): Summary {
  const n = rows.length;
  const share = (f: (r: WeekResult) => boolean) => rows.filter(f).length / n;
  const perBoss = (num: number, pick: (t: BossTrace) => number | null) =>
    mean(rows.flatMap((r) => r.bossTrace.filter((t) => t.number === num).map(pick).filter((v): v is number => v !== null)));
  const recoveries = rows.flatMap((r) => r.breachRecoveryHours);
  const ends = rows.map((r) => r.castleEndPct);
  const totalEarned = rows.reduce((sum, r) => sum + r.earned, 0);
  return {
    n,
    bossesMean: mean(rows.map((r) => r.bosses)),
    bossDist: { zero: share((r) => r.bosses === 0), one: share((r) => r.bosses === 1), two: share((r) => r.bosses === 2), threePlus: share((r) => r.bosses >= 3) },
    breachWeekShare: share((r) => r.breaches > 0),
    costlyBreachShare: share((r) => r.costlyBreach),
    endedInBreachShare: share((r) => r.breachOpenAtEnd),
    breachesPerWeek: mean(rows.map((r) => r.breaches)),
    castleEnd: { mean: mean(ends), p10: quantile(ends, 0.1), p50: quantile(ends, 0.5), p90: quantile(ends, 0.9) },
    castleMinMean: mean(rows.map((r) => r.castleMinPct)),
    castleByDay: [0, 1, 2, 3, 4, 5, 6].map((d) => mean(rows.map((r) => r.castleByDay[d]).filter((v) => v !== undefined))),
    hours: Object.fromEntries(PHASES.map((p) => [p, mean(rows.map((r) => r.hours[p]))])) as Record<PhaseKey, number>,
    bossCombatHours: [1, 2, 3].map((k) => perBoss(k, (t) => t.combatHours)),
    bossDefeatHour: [1, 2, 3].map((k) => perBoss(k, (t) => t.defeatedHour)),
    recovery: { n: recoveries.length, mean: mean(recoveries), max: recoveries.length ? Math.max(...recoveries) : NaN },
    donationShare: totalEarned ? rows.reduce((sum, r) => sum + r.donated, 0) / totalEarned : 0,
    earned: mean(rows.map((r) => r.earned)),
    projectLevels: Object.fromEntries(PROJECTS.map((k) => [k, mean(rows.map((r) => r.projectLevels[k]))])) as Record<ProjectKey, number>,
    questionRepairPct: mean(rows.map((r) => r.questionRepairPct)),
    activatedPct: mean(rows.map((r) => r.activatedPct)),
  };
}

/** Runs several cohorts (seeds 0..seeds-1) and returns every class-week, optionally filtered to certain week numbers. */
export function runCohorts(base: Omit<RunConfig, 'seed'>, seeds: number, onlyWeeks?: number[]): WeekResult[] {
  const rows: WeekResult[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    for (const r of runScenario({ ...base, seed })) if (!onlyWeeks || onlyWeeks.includes(r.week)) rows.push(r);
  }
  return rows;
}
