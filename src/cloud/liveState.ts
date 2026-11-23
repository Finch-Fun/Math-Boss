// Pure helpers for the multiplayer screens (no Firebase, no React). The server's campaign document is the only truth; these
// functions only PROJECT it forward to "now" for smooth display and derive display values from it. Nothing here is ever sent back.
import { classDpsOf, castleMax, settleCampaign, type CampaignState } from '../game/campaign';
import { weekdayIndexZ } from '../game/zoned';
import type { GameState, Settings } from '../game/types';
import type { PlayerDoc, PlayerView } from './multiplayerTypes';

export interface ProjectionContext {
  timeZone: string;
  settings: Pick<Settings, 'dailyQuestions' | 'bossDifficulty'>;
}

export interface Projection {
  state: CampaignState;
  /** The projection reached an event that needs the server (week change or new boss): ask the server to settle. */
  needsServer: boolean;
  /** How far past the last authoritative update the estimate is (ms). */
  ageMs: number;
}

/** Estimates the campaign at `now` from the last authoritative state. Display only; the server's next write is final. */
export function projectCampaign(c: CampaignState, now: number, ctx: ProjectionContext): Projection {
  const copy = structuredClone(c);
  if (now <= c.lastSettledAt || c.weekIndex === 0) return { state: copy, needsServer: false, ageMs: 0 };
  const res = settleCampaign(copy, now, ctx, { projection: true });
  return { state: copy, needsServer: res.needsRoster, ageMs: now - c.lastSettledAt };
}

/** Milliseconds the local clock must be shifted to estimate server time. Display only. */
export const clockOffset = (serverNow: number, localNow: number): number => serverNow - localNow;

/** Time to defeat the current boss at the current class DPS, or null when not fighting. */
export function etaToDefeat(c: CampaignState): number | null {
  if (c.phase !== 'combat' || !c.boss) return null;
  const dps = classDpsOf(c);
  return dps > 0 ? (c.boss.hp / dps) * 1000 : null;
}

/** A GameState-shaped wrapper so the existing phase text (describePhase, castle helpers) can render shared state. No students. */
export function campaignAsGameState(c: CampaignState, now: number, className: string, settings: Settings): GameState {
  return {
    version: 1,
    now,
    savedAtReal: now,
    playerId: '',
    className,
    students: [],
    settings,
    battle: {
      phase: c.phase,
      boss: c.boss,
      bossesDefeated: c.bossesDefeated,
      castleHp: c.castleHp,
      baseCastleMaxHp: c.baseCastleMaxHp,
      nextAttackAt: c.nextAttackAt,
      trainingEndsAt: c.trainingEndsAt,
      weekIndex: c.weekIndex,
      weekStart: c.weekStart,
      weekEnd: c.weekEnd,
    },
    projects: c.projects,
    stats: c.stats,
    history: c.history,
    daySnapshot: { at: now, bossPct: 0, bossNumber: c.boss?.number ?? 0, castlePct: 1, donated: 0, questions: 0 },
    dev: { dpsMultiplier: 1, botsEnabled: false },
    log: c.log,
  };
}

export const castleCap = (c: CampaignState): number => castleMax(c);

/** Student view derived from the listener documents (mirrors what the server returns in `me`). */
export function viewOfPlayer(p: PlayerDoc, c: CampaignState, ctx: ProjectionContext, now: number): PlayerView {
  const w = p.week && p.week.index === c.weekIndex ? p.week : null;
  const today = weekdayIndexZ(now, ctx.timeZone);
  let unlocked = 0;
  for (let i = 0; i <= today; i++) unlocked += ctx.settings.dailyQuestions[i] ?? 0;
  return {
    uid: p.uid,
    nickname: p.nickname,
    coins: p.coins,
    lifetimeCoins: p.lifetimeCoins,
    upgrades: p.upgrades,
    dps: w?.activated ? w.dps : 0,
    activated: !!w?.activated,
    weekDamage: w ? w.damage + (w.activated ? Math.max(0, w.dps * (c.acc - w.accAt)) : 0) : 0,
    weekDonated: w?.donated ?? 0,
    weekQuestions: w?.questions ?? 0,
    dailyUnlocked: unlocked,
    dailyRemaining: Math.max(0, unlocked - (w?.questions ?? 0)),
    currentWrong: w?.currentWrong ?? 0,
  };
}
