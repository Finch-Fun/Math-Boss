// Aggregate, deterministic combat settlement for the server-authoritative multiplayer campaign.
//
// Instead of integrating every student every hour (src/game/engine.ts, used by the local prototype), the campaign keeps
// the class's combined base DPS (`dpsSum`) and a per-unit damage accumulator (`acc`). Between trusted operations the DPS is
// constant, so elapsed time is settled in closed form:
//   * boss damage = dpsSum x banner bonus x dt, capped at the boss's HP;
//   * hourly boss attacks are counted arithmetically (no per-hour loop);
//   * only real transitions (boss defeat, breach, recovery, training end, week end) are processed one by one.
// A student's own damage is recoverable lazily: dps_i x (acc_now - acc_at_last_change). Nothing is written per hit.
//
// Pure TypeScript: no Firebase, no clock. The caller passes the authoritative server time.
import { BOSS_ATTACK_INTERVAL, HOUR, PROJECT_DEFS, PROJECT_KEYS, TRAINING_DURATION, TUNING } from './constants';
import { spawnBoss, type BossInputs } from './boss';
import { freshProjects, projectCost } from './projects';
import { dps } from './upgrades';
import { weekEndZ, weekStartZ } from './zoned';
import type { Boss, LogEntry, Phase, ProjectKey, ProjectState, Settings, Upgrades, WeekStats, WeekSummary } from './types';

/** At most this many weeks are simulated per settlement; anything older is skipped (see `skippedWeeks`). */
export const MAX_SIMULATED_WEEKS = 8;
const MAX_EVENTS = 4000;
const MAX_HISTORY = 12;
const MAX_LOG = 25;

export interface CampaignState {
  schema: 1;
  weekIndex: number;
  weekStart: number;
  weekEnd: number;
  /** Server time up to which combat has been settled. */
  lastSettledAt: number;
  phase: Phase;
  boss: Boss | null;
  bossesDefeated: number;
  castleHp: number;
  baseCastleMaxHp: number;
  nextAttackAt: number | null; // null = dormant until the first activation
  trainingEndsAt: number | null;
  projects: Record<ProjectKey, ProjectState>;
  stats: WeekStats;
  studentCount: number;
  activatedCount: number;
  /** Sum of the activated students' personal DPS (before the Banner bonus). */
  dpsSum: number;
  /** Cumulative boss damage per unit of personal DPS this week. */
  acc: number;
  /** Week index for which all students were auto-activated (zero-question weeks), else 0. */
  zeroWeekAppliedFor: number;
  /** Server time of the roster snapshot used by the zero-question rule, and the accumulator value at that moment. */
  zeroWeekAt: number;
  zeroWeekAcc: number;
  /** Weeks skipped because the classroom went unsettled for longer than MAX_SIMULATED_WEEKS. */
  skippedWeeks: number;
  history: WeekSummary[];
  log: LogEntry[];
}

export interface RosterEntry {
  uid: string;
  upgrades: Upgrades;
  coins: number;
}

export interface SettleContext {
  timeZone: string;
  settings: Pick<Settings, 'dailyQuestions' | 'bossDifficulty'>;
  /** Server time at which the roster handed to the settlement was read. Defaults to the event time. */
  rosterAt?: number;
}

// ---------- derived values ----------
export const castleMax = (c: CampaignState): number => Math.round(c.baseCastleMaxHp * (1 + TUNING.wallsPerLevel * c.projects.walls.level));
export const armor = (c: CampaignState): number => Math.min(0.5, TUNING.armorPerLevel * c.projects.plating.level);
export const bannerBonus = (c: CampaignState): number => Math.min(0.25, 0.05 * c.projects.banner.level);
export const classDpsOf = (c: CampaignState): number => c.dpsSum * (1 + bannerBonus(c));
export const isZeroQuestionWeek = (settings: Pick<Settings, 'dailyQuestions'>): boolean => settings.dailyQuestions.every((n) => n === 0);

function note(c: CampaignState, at: number, text: string): void {
  c.log.unshift({ at, text });
  if (c.log.length > MAX_LOG) c.log.length = MAX_LOG;
}

export const freshStats = (): WeekStats => ({ questions: 0, donated: 0, breaches: 0, emergencyRepairHp: 0 });

/** A brand-new campaign whose first week starts at `weekStart`. The caller then runs `beginWeek`. */
export function newCampaign(at: number, timeZone: string): CampaignState {
  const weekStart = weekStartZ(at, timeZone);
  return {
    schema: 1,
    weekIndex: 0,
    weekStart,
    weekEnd: weekEndZ(weekStart, timeZone),
    lastSettledAt: at,
    phase: 'idle',
    boss: null,
    bossesDefeated: 0,
    castleHp: 0,
    baseCastleMaxHp: 0,
    nextAttackAt: null,
    trainingEndsAt: null,
    projects: freshProjects(),
    stats: freshStats(),
    studentCount: 0,
    activatedCount: 0,
    dpsSum: 0,
    acc: 0,
    zeroWeekAppliedFor: 0,
    zeroWeekAt: 0,
    zeroWeekAcc: 0,
    skippedWeeks: 0,
    history: [],
    log: [],
  };
}

/** Personal DPS helper re-exported so the service and the client share one formula. */
export { dps as personalDps } from './upgrades';

/** Sync call: roster already available. Resets weekly state, builds the castle and the first boss, applies the zero-question rule. */
export function beginWeek(c: CampaignState, at: number, weekStart: number, ctx: SettleContext, roster: RosterEntry[]): void {
  if (c.weekIndex > 0) {
    c.history.unshift({
      weekIndex: c.weekIndex,
      weekStart: c.weekStart,
      bossesDefeated: c.bossesDefeated,
      castlePct: c.baseCastleMaxHp > 0 ? c.castleHp / castleMax(c) : 0,
      activatedFraction: c.studentCount ? c.activatedCount / c.studentCount : 0,
      donated: c.stats.donated,
      questions: c.stats.questions,
      breaches: c.stats.breaches,
    });
    if (c.history.length > MAX_HISTORY) c.history.length = MAX_HISTORY;
  }
  c.weekIndex += 1;
  c.weekStart = weekStart;
  c.weekEnd = weekEndZ(weekStart, ctx.timeZone);
  c.projects = freshProjects();
  c.stats = freshStats();
  c.studentCount = roster.length;
  c.baseCastleMaxHp = TUNING.castleHpPerStudent * roster.length;
  c.castleHp = castleMax(c);
  c.bossesDefeated = 0;
  c.phase = 'combat';
  c.trainingEndsAt = null;
  c.nextAttackAt = null;
  c.activatedCount = 0;
  c.dpsSum = 0;
  c.acc = 0;
  c.zeroWeekAppliedFor = 0;
  c.zeroWeekAt = 0;
  c.zeroWeekAcc = 0;
  c.lastSettledAt = Math.max(c.lastSettledAt, at);
  c.boss = spawnBoss(bossInputs(c, ctx, roster, at), 1);
  if (isZeroQuestionWeek(ctx.settings)) applyZeroWeek(c, roster, at, ctx.rosterAt ?? at);
  note(c, at, c.weekIndex === 1 ? 'The campaign begins! Boss 1 appears.' : 'A new weekly campaign begins! The castle is restored and Boss 1 appears.');
}

function bossInputs(c: CampaignState, ctx: SettleContext, roster: RosterEntry[], at: number): BossInputs {
  return { now: at, students: roster, settings: ctx.settings, history: c.history };
}

/** Zero-question week (design §10.1): every current student is activated automatically. */
export function applyZeroWeek(c: CampaignState, roster: RosterEntry[], at: number, rosterAt: number = at): void {
  if (c.zeroWeekAppliedFor === c.weekIndex) return;
  c.zeroWeekAppliedFor = c.weekIndex;
  c.zeroWeekAt = rosterAt;
  c.zeroWeekAcc = c.acc;
  c.activatedCount = roster.length;
  c.dpsSum = roster.reduce((sum, r) => sum + dps(r.upgrades), 0);
  startAttackClock(c, at);
}

/** The boss's attack clock starts at the first activation so the class never takes damage before it could act (§10.2). */
export function startAttackClock(c: CampaignState, at: number): void {
  if (c.phase === 'combat' && c.nextAttackAt === null && c.activatedCount > 0) c.nextAttackAt = at + BOSS_ATTACK_INTERVAL;
}

/** Adjusts the aggregate DPS when one student's personal DPS changes (activation or upgrade). Settle to `at` first. */
export function changeStudentDps(c: CampaignState, from: number, to: number, activating: boolean, at: number): void {
  if (activating) c.activatedCount += 1;
  c.dpsSum = Math.max(0, roundDps(c.dpsSum - from + to));
  if (activating) startAttackClock(c, at);
}

/** A student leaves the class (removed or un-approved): stop counting their DPS. Settle to the removal time first. */
export function removeStudentDps(c: CampaignState, dps: number): void {
  c.dpsSum = Math.max(0, roundDps(c.dpsSum - dps));
  c.activatedCount = Math.max(0, c.activatedCount - 1);
}

const roundDps = (n: number): number => Math.round(n * 1e9) / 1e9;

// ---------- settlement ----------
type EventKind = 'week_end' | 'boss_dead' | 'boss_attack' | 'training_end' | 'breach_recovered';
interface Ev {
  time: number;
  kind: EventKind;
  priority: number; // lower runs first at equal timestamps (same ordering as engine.ts)
}

const attackDamage = (c: CampaignState): number => Math.max(1, Math.round((c.boss as Boss).attackPerHour * (1 - armor(c))));

function nextEvent(c: CampaignState, now: number, target: number): Ev | null {
  const cand: Ev[] = [{ time: c.weekEnd, kind: 'week_end', priority: 0 }];
  if (c.phase === 'combat' && c.boss) {
    const dpsNow = classDpsOf(c);
    if (c.boss.hp <= 0) cand.push({ time: now, kind: 'boss_dead', priority: 1 });
    else if (dpsNow > 0) cand.push({ time: now + Math.ceil((c.boss.hp / dpsNow) * 1000), kind: 'boss_dead', priority: 1 });
    if (c.nextAttackAt !== null) {
      // Closed form: the attack that brings the castle to zero is the m-th attack from nextAttackAt.
      const m = Math.max(1, Math.ceil(c.castleHp / attackDamage(c)));
      cand.push({ time: c.nextAttackAt + (m - 1) * BOSS_ATTACK_INTERVAL, kind: 'boss_attack', priority: 2 });
    }
  }
  if (c.phase === 'training' && c.trainingEndsAt !== null) cand.push({ time: c.trainingEndsAt, kind: 'training_end', priority: 3 });
  if (c.phase === 'breach') {
    const max = castleMax(c);
    const need = TUNING.breachRecoveryFraction * max - c.castleHp;
    const time = need <= 0 ? now : now + Math.ceil((need / (TUNING.autoReconstructionPerHour * max)) * HOUR);
    cand.push({ time, kind: 'breach_recovered', priority: 4 });
  }
  let best: Ev | null = null;
  for (const e of cand) {
    const time = Math.max(e.time, now);
    if (time > target) continue;
    if (best === null || time < best.time || (time === best.time && e.priority < best.priority)) best = { ...e, time };
  }
  return best;
}

/** Applies `n` full hourly attacks that happen strictly before the castle can fall (the falling attack is its own event). */
function applyAttacksUpTo(c: CampaignState, to: number): void {
  if (c.phase !== 'combat' || c.nextAttackAt === null || !c.boss) return;
  if (to < c.nextAttackAt) return;
  const n = Math.floor((to - c.nextAttackAt) / BOSS_ATTACK_INTERVAL) + 1;
  const dmg = attackDamage(c);
  const survivable = Math.max(0, Math.ceil(c.castleHp / dmg) - 1);
  const k = Math.min(n, survivable);
  c.castleHp -= k * dmg;
  c.nextAttackAt += k * BOSS_ATTACK_INTERVAL;
}

function integrate(c: CampaignState, from: number, to: number): void {
  const dt = to - from;
  if (dt <= 0) return;
  if (c.phase === 'combat' && c.boss) {
    // Attacks strictly before `to` (an attack exactly at `to` is handled as an event so priority rules apply).
    applyAttacksUpTo(c, to - 1);
    const total = (classDpsOf(c) * dt) / 1000;
    if (total > 0) {
      const dealt = Math.min(total, c.boss.hp);
      c.acc += dealt / Math.max(c.dpsSum, 1e-12);
      c.boss.hp -= dealt;
    }
  } else if (c.phase === 'breach') {
    const max = castleMax(c);
    c.castleHp = Math.min(max, c.castleHp + TUNING.autoReconstructionPerHour * max * (dt / HOUR));
  }
}

function handle(c: CampaignState, ev: Ev, ctx: SettleContext, rosterFor: () => RosterEntry[]): void {
  switch (ev.kind) {
    case 'week_end':
      beginWeek(c, ev.time, c.weekEnd, ctx, rosterFor());
      break;
    case 'boss_dead': {
      const boss = c.boss as Boss;
      boss.hp = 0;
      c.bossesDefeated += 1;
      c.phase = 'training';
      c.trainingEndsAt = ev.time + TRAINING_DURATION;
      c.nextAttackAt = null;
      note(c, ev.time, `Boss ${boss.number} (${boss.name}) defeated! The class trains for 24 hours.`);
      break;
    }
    case 'boss_attack': {
      const dmg = attackDamage(c);
      c.castleHp = Math.max(0, c.castleHp - dmg);
      c.nextAttackAt = (c.nextAttackAt as number) + BOSS_ATTACK_INTERVAL;
      if (c.castleHp <= 0) {
        c.phase = 'breach';
        c.nextAttackAt = null;
        c.stats.breaches += 1;
        note(c, ev.time, 'The castle has been breached! Attacks pause until it recovers to 25%.');
      }
      break;
    }
    case 'training_end':
      c.trainingEndsAt = null;
      if (c.weekEnd - ev.time > TUNING.noSpawnWindowHours * HOUR) {
        c.boss = spawnBoss(bossInputs(c, ctx, rosterFor(), ev.time), c.bossesDefeated + 1);
        c.phase = 'combat';
        c.nextAttackAt = c.activatedCount > 0 ? ev.time + BOSS_ATTACK_INTERVAL : null;
        note(c, ev.time, `Boss ${c.boss.number} (${c.boss.name}) has appeared!`);
      } else {
        c.phase = 'idle';
        note(c, ev.time, 'Training is over, but too little time remains this week for another boss.');
      }
      break;
    case 'breach_recovered':
      if (c.phase === 'breach') resume(c, ev.time);
      break;
  }
}

export function resume(c: CampaignState, at: number): void {
  c.phase = 'combat';
  c.nextAttackAt = c.activatedCount > 0 ? at + BOSS_ATTACK_INTERVAL : null;
  note(c, at, 'The castle has recovered. Combat resumes!');
}

/** Emergency reconstruction from a correct Daily Review answer during a breach (never awards coins). */
export function questionRepair(c: CampaignState, at: number): void {
  if (c.phase !== 'breach') return;
  const max = castleMax(c);
  const add = TUNING.questionRepairFraction * max;
  c.castleHp = Math.min(max, c.castleHp + add);
  c.stats.emergencyRepairHp += add;
  if (c.castleHp >= TUNING.breachRecoveryFraction * max - 1e-6) resume(c, at);
}

export interface SettleResult {
  /** True if the settlement had to stop early because it needed the roster (projection mode). */
  needsRoster: boolean;
  skippedWeeks: number;
  events: number;
}

/**
 * Settles the campaign from `c.lastSettledAt` to `target` (server time). Mutates `c`. Deterministic: the same state and
 * target always produce the same result, so concurrent requests that each settle to different times agree.
 * With `projection` set, the roster is not available: the run stops (needsRoster) at the first event that would need it.
 */
export function settleCampaign(c: CampaignState, target: number, ctx: SettleContext, opts: { projection?: boolean; roster?: RosterEntry[] } = {}): SettleResult {
  const result: SettleResult = { needsRoster: false, skippedWeeks: 0, events: 0 };
  if (target <= c.lastSettledAt) return result;
  const cache = opts.roster;
  const rosterFor = (): RosterEntry[] => {
    if (!cache) throw new Error('settleCampaign: roster required');
    return cache;
  };
  let now = c.lastSettledAt;

  // Bound the work: weeks older than MAX_SIMULATED_WEEKS are skipped with calendar arithmetic only (no combat simulation).
  const horizon = target - MAX_SIMULATED_WEEKS * 7 * 24 * HOUR;
  if (c.weekEnd <= horizon && cache) {
    let wk = c.weekEnd;
    let skipped = 0;
    for (let next = weekEndZ(wk, ctx.timeZone); next <= horizon && skipped < 200_000; next = weekEndZ(wk, ctx.timeZone)) {
      wk = next;
      skipped += 1;
    }
    c.weekIndex += skipped; // beginWeek adds one more
    c.skippedWeeks += skipped;
    result.skippedWeeks = skipped;
    now = Math.max(now, wk);
    c.lastSettledAt = now;
    beginWeek(c, wk, wk, ctx, cache);
    result.events += 1;
  }

  for (let guard = 0; ; guard++) {
    if (guard > MAX_EVENTS) throw new Error('settleCampaign: event budget exceeded');
    const ev = nextEvent(c, now, target);
    if (!ev) {
      integrate(c, now, target);
      c.lastSettledAt = target;
      return result;
    }
    const needs = ev.kind === 'week_end' || ev.kind === 'training_end';
    if (needs && opts.projection && !cache) {
      // training_end only needs the roster when it will actually spawn a boss.
      const willSpawn = ev.kind === 'week_end' || c.weekEnd - ev.time > TUNING.noSpawnWindowHours * HOUR;
      if (willSpawn) {
        integrate(c, now, ev.time);
        c.lastSettledAt = ev.time;
        result.needsRoster = true;
        return result;
      }
    }
    integrate(c, now, ev.time);
    now = ev.time;
    c.lastSettledAt = now;
    handle(c, ev, ctx, rosterFor);
    result.events += 1;
  }
}

/** Whether a settlement up to `target` would need the roster (a week boundary or boss spawn before then). Cheap pre-check. */
export function settlementNeedsRoster(c: CampaignState, target: number, ctx: SettleContext): boolean {
  if (target <= c.lastSettledAt) return false;
  if (c.weekIndex === 0) return true;
  const probe: CampaignState = structuredClone(c);
  return settleCampaign(probe, target, ctx, { projection: true }).needsRoster;
}

/** A student's damage this week, recovered lazily from the accumulator. */
export const studentDamageSince = (dpsUnit: number, accNow: number, accAt: number): number => Math.max(0, dpsUnit * (accNow - accAt));

// ---------- shared projects ----------
export const campaignProjectCost = (c: CampaignState, key: ProjectKey): number => projectCost(key, c.projects[key].level, Math.max(1, c.studentCount));
export function isCampaignProjectMaxed(c: CampaignState, key: ProjectKey): boolean {
  const max = PROJECT_DEFS[key].maxLevel;
  return max !== null && c.projects[key].level >= max;
}

function completeProject(c: CampaignState, key: ProjectKey, at: number): void {
  const p = c.projects[key];
  const before = castleMax(c);
  p.level += 1;
  p.funded = 0;
  if (key === 'walls') {
    c.castleHp += castleMax(c) - before;
  } else if (key === 'repairs') {
    const max = castleMax(c);
    c.castleHp = Math.min(max, c.castleHp + Math.round(TUNING.repairsFraction * max));
    if (c.phase === 'breach' && c.castleHp >= TUNING.breachRecoveryFraction * max - 1e-6) resume(c, at);
  }
  note(c, at, `Project complete: ${PROJECT_DEFS[key].label}!`);
}

/**
 * Applies a donation to the shared project. The caller has validated the donor's balance. Returns the coins actually charged
 * (never more than the remaining cost, so a project cannot be double-funded) and whether this donation completed it.
 */
export function fundProject(c: CampaignState, key: ProjectKey, amount: number, at: number): { charged: number; completed: boolean } {
  const p = c.projects[key];
  const charged = Math.max(0, Math.min(amount, campaignProjectCost(c, key) - p.funded));
  p.funded += charged;
  c.stats.donated += charged;
  const completed = charged > 0 && p.funded >= campaignProjectCost(c, key);
  if (completed) completeProject(c, key, at);
  return { charged, completed };
}

export { PROJECT_KEYS };
