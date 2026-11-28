// Adapters that turn the existing game state into what the battlefield draws. READ-ONLY: nothing here writes anywhere, and nothing
// recomputes damage, HP or timing. Boss and castle HP are exactly the numbers in the (server-settled, client-projected) campaign.
import { castleMax, classDpsOf, type CampaignState } from '../game/campaign';
import { activatedCount, castleMaxHp, classDps } from '../game/core';
import type { GameState, Phase } from '../game/types';
import type { ArmyMember } from './layout';

export interface BattleView {
  bossNumber: number | null;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  castleHp: number;
  castleMaxHp: number;
  phase: Phase;
  nextAttackAt: number | null;
  trainingEndsAt: number | null;
  weekEnd: number;
  now: number;
  studentCount: number;
  activeCount: number;
  classDps: number;
  members: ArmyMember[];
  /** Cheap identity of `members` so the army is rebuilt only when it really changes (not on every clock tick). */
  armyKey: string;
  /** The current student's identity (for the YOU marker) and whether they have joined this week's battle. */
  self: { uid: string; active: boolean } | null;
}

/** Roster size the Functions allow; the anonymous army is capped here too. */
const MAX_ROSTER = 200;

/**
 * Multiplayer. Firebase rules keep other students' records private, so the battlefield is built from the PUBLIC class totals
 * (activatedCount, studentCount) plus the current student's own identity. Classmates are drawn as anonymous fighters (their class
 * is a stand-in derived from the classroom, not a real student's record). Only YOUR character is you.
 */
export function viewFromCampaign(c: CampaignState, now: number, room: string, me: { uid: string; activated: boolean } | null): BattleView {
  const total = Math.min(MAX_ROSTER, Math.max(0, c.studentCount));
  const active = Math.min(total, Math.max(0, c.activatedCount));
  const activeOthers = Math.max(0, active - (me?.activated ? 1 : 0));
  const inactiveOthers = Math.max(0, total - active - (me && !me.activated ? 1 : 0));
  const members: ArmyMember[] = [
    ...(me ? [{ uid: me.uid, active: me.activated }] : []),
    ...Array.from({ length: activeOthers }, (_, i) => ({ uid: `${room}#a${i}`, active: true })),
    ...Array.from({ length: inactiveOthers }, (_, i) => ({ uid: `${room}#i${i}`, active: false })),
  ];
  return {
    bossNumber: c.boss?.number ?? null,
    bossName: c.boss?.name ?? '',
    bossHp: c.boss?.hp ?? 0,
    bossMaxHp: c.boss?.maxHp ?? 0,
    castleHp: c.castleHp,
    castleMaxHp: castleMax(c),
    phase: c.phase,
    nextAttackAt: c.nextAttackAt,
    trainingEndsAt: c.trainingEndsAt,
    weekEnd: c.weekEnd,
    now,
    studentCount: c.studentCount,
    activeCount: c.activatedCount,
    classDps: classDpsOf(c),
    members,
    armyKey: `${room}|${activeOthers}|${inactiveOthers}|${me?.uid ?? ''}|${me?.activated ? 1 : 0}`,
    self: me ? { uid: me.uid, active: me.activated } : null,
  };
}

/** Local demo / practice game: the simulated classmates are real objects with ids, so the army is exact. */
export function viewFromGameState(s: GameState): BattleView {
  const b = s.battle;
  const members = s.students.map((st) => ({ uid: st.id, active: st.activated }));
  return {
    bossNumber: b.boss?.number ?? null,
    bossName: b.boss?.name ?? '',
    bossHp: b.boss?.hp ?? 0,
    bossMaxHp: b.boss?.maxHp ?? 0,
    castleHp: b.castleHp,
    castleMaxHp: castleMaxHp(s),
    phase: b.phase,
    nextAttackAt: b.nextAttackAt,
    trainingEndsAt: b.trainingEndsAt,
    weekEnd: b.weekEnd,
    now: s.now,
    studentCount: s.students.length,
    activeCount: activatedCount(s),
    classDps: classDps(s),
    members,
    armyKey: members.map((m) => `${m.uid}${m.active ? '+' : '-'}`).join(','),
    self: s.playerId ? { uid: s.playerId, active: !!s.students.find((x) => x.id === s.playerId)?.activated } : null,
  };
}
