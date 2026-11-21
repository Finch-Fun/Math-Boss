// Event-driven combat engine. Between events the class DPS is constant, so damage is computed exactly from
// elapsed time (no per-attack writes) and the same code handles live play, offline progress and dev time-skips.
import {
  AUTO_RECONSTRUCTION_PER_HOUR,
  BOSS_ATTACK_INTERVAL,
  BREACH_RECOVERY_FRACTION,
  CASTLE_HP_PER_STUDENT,
  NO_SPAWN_WINDOW,
  TRAINING_DURATION,
} from './constants';
import { spawnBoss } from './boss';
import { nextBotSession, runBotSession } from './bots';
import {
  activatedCount,
  applyZeroWeekRule,
  armorPct,
  castleMaxHp,
  classDps,
  log,
  resumeCombat,
  snapshotDay,
  studentDps,
} from './core';
import { freshProjects } from './projects';
import { addDays, dayStart, weekEndOf } from './time';
import type { GameState } from './types';

type EventKind = 'week_end' | 'boss_dead' | 'boss_attack' | 'training_end' | 'breach_recovered' | 'day_start' | 'bot_session';
interface GameEvent {
  time: number;
  kind: EventKind;
  priority: number; // lower runs first when events share a timestamp
  botIndex?: number;
}

export const freshStats = () => ({ questions: 0, donated: 0, breaches: 0, emergencyRepairHp: 0 });

/** Monday 12:00 AM. Preserves coins and permanent upgrades; resets everything weekly (design §11.1, §17). */
export function startNewWeek(s: GameState, at: number, initial = false): void {
  const b = s.battle;
  const n = s.students.length;
  if (!initial) {
    s.history.unshift({
      weekIndex: b.weekIndex,
      weekStart: b.weekStart,
      bossesDefeated: b.bossesDefeated,
      castlePct: b.castleHp / castleMaxHp(s),
      activatedFraction: n ? activatedCount(s) / n : 0,
      donated: s.stats.donated,
      questions: s.stats.questions,
      breaches: s.stats.breaches,
    });
    if (s.history.length > 26) s.history.length = 26;
  }
  for (const st of s.students) {
    st.activated = false;
    st.weekDamage = 0;
    st.weekDonated = 0;
    st.weekQuestions = 0;
    st.weekFirstTry = 0;
    st.currentWrong = 0;
    st.bonusAnswers = {};
  }
  s.projects = freshProjects();
  s.stats = freshStats();
  b.weekIndex = initial ? 1 : b.weekIndex + 1;
  b.weekStart = at;
  b.weekEnd = weekEndOf(at);
  b.baseCastleMaxHp = CASTLE_HP_PER_STUDENT * n;
  b.castleHp = castleMaxHp(s);
  b.bossesDefeated = 0;
  b.phase = 'combat';
  b.trainingEndsAt = null;
  b.nextAttackAt = null;
  b.boss = spawnBoss(s, 1);
  applyZeroWeekRule(s);
  snapshotDay(s);
  if (!initial) log(s, 'A new weekly campaign begins! The castle is restored and Boss 1 appears.');
}

function nextEvent(s: GameState, target: number): GameEvent | null {
  const b = s.battle;
  const candidates: GameEvent[] = [{ time: b.weekEnd, kind: 'week_end', priority: 0 }];
  if (b.phase === 'combat' && b.boss) {
    const dpsNow = classDps(s);
    if (b.boss.hp <= 0) candidates.push({ time: s.now, kind: 'boss_dead', priority: 1 });
    else if (dpsNow > 0) candidates.push({ time: s.now + Math.ceil((b.boss.hp / dpsNow) * 1000), kind: 'boss_dead', priority: 1 });
    if (b.nextAttackAt !== null) candidates.push({ time: b.nextAttackAt, kind: 'boss_attack', priority: 2 });
  }
  if (b.phase === 'training' && b.trainingEndsAt !== null) {
    candidates.push({ time: b.trainingEndsAt, kind: 'training_end', priority: 3 });
  }
  if (b.phase === 'breach') {
    const max = castleMaxHp(s);
    const need = BREACH_RECOVERY_FRACTION * max - b.castleHp;
    const time = need <= 0 ? s.now : s.now + Math.ceil((need / (AUTO_RECONSTRUCTION_PER_HOUR * max)) * 3_600_000);
    candidates.push({ time, kind: 'breach_recovered', priority: 4 });
  }
  candidates.push({ time: addDays(dayStart(s.now), 1), kind: 'day_start', priority: 5 });
  const bot = nextBotSession(s);
  if (bot) candidates.push({ time: bot.time, kind: 'bot_session', priority: 6, botIndex: bot.index });

  let best: GameEvent | null = null;
  for (const c of candidates) {
    const time = Math.max(c.time, s.now);
    if (time > target) continue;
    if (best === null || time < best.time || (time === best.time && c.priority < best.priority)) best = { ...c, time };
  }
  return best;
}

function integrate(s: GameState, to: number): void {
  const dt = to - s.now;
  if (dt <= 0) return;
  const b = s.battle;
  if (b.phase === 'combat' && b.boss) {
    const total = (classDps(s) * dt) / 1000;
    if (total > 0) {
      const dealt = Math.min(total, b.boss.hp);
      const scale = dealt / total;
      for (const st of s.students) st.weekDamage += ((studentDps(s, st) * dt) / 1000) * scale;
      b.boss.hp -= dealt;
    }
  } else if (b.phase === 'breach') {
    const max = castleMaxHp(s);
    b.castleHp = Math.min(max, b.castleHp + AUTO_RECONSTRUCTION_PER_HOUR * max * (dt / 3_600_000));
  }
  s.now = to;
}

function handle(s: GameState, ev: GameEvent): void {
  const b = s.battle;
  switch (ev.kind) {
    case 'week_end':
      startNewWeek(s, s.now);
      break;
    case 'boss_dead': {
      const boss = b.boss!;
      boss.hp = 0;
      b.bossesDefeated += 1;
      b.phase = 'training';
      b.trainingEndsAt = s.now + TRAINING_DURATION;
      b.nextAttackAt = null;
      log(s, `Boss ${boss.number} (${boss.name}) defeated! The class trains for 24 hours.`);
      break;
    }
    case 'boss_attack': {
      const boss = b.boss!;
      const damage = Math.max(1, Math.round(boss.attackPerHour * (1 - armorPct(s))));
      b.castleHp = Math.max(0, b.castleHp - damage);
      b.nextAttackAt = (b.nextAttackAt as number) + BOSS_ATTACK_INTERVAL;
      if (b.castleHp <= 0) {
        b.phase = 'breach';
        b.nextAttackAt = null;
        s.stats.breaches += 1;
        log(s, 'The castle has been breached! Attacks pause until it recovers to 25%.');
      }
      break;
    }
    case 'training_end': {
      b.trainingEndsAt = null;
      if (b.weekEnd - s.now > NO_SPAWN_WINDOW) {
        b.boss = spawnBoss(s, b.bossesDefeated + 1);
        b.phase = 'combat';
        b.nextAttackAt = s.now + BOSS_ATTACK_INTERVAL;
        log(s, `Boss ${b.boss.number} (${b.boss.name}) has appeared!`);
      } else {
        b.phase = 'idle';
        log(s, 'Training is over, but too little time remains this week for another boss.');
      }
      break;
    }
    case 'breach_recovered':
      if (b.phase === 'breach') resumeCombat(s);
      break;
    case 'day_start':
      snapshotDay(s);
      break;
    case 'bot_session':
      runBotSession(s, s.students[ev.botIndex!], ev.time);
      break;
  }
}

/** Simulates the battle from state.now up to `target`, processing every event in order. Mutates `s`. */
export function advance(s: GameState, target: number): void {
  for (let guard = 0; ; guard++) {
    if (guard > 100_000) throw new Error('advance: runaway event loop');
    const ev = nextEvent(s, target);
    if (!ev) {
      integrate(s, target);
      return;
    }
    integrate(s, ev.time);
    handle(s, ev);
  }
}
