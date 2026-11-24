// Contract between the browser and the trusted game service (Cloud Functions). Types only, no Firebase and no secrets.
// The browser sends intents (an answer, an upgrade key, a donation amount) and never results: it cannot supply coins,
// damage, attempt counts, rewards or timestamps. See functions/src/core/service.ts for the enforcement.
import type { CampaignState } from '../game/campaign';
import type { ProjectKey, SkillKey, QuestionDifficulty, UpgradeKey, Upgrades } from '../game/types';

export const FUNCTION_NAMES = {
  sync: 'mbSync',
  getDaily: 'mbGetDaily',
  submitDaily: 'mbSubmitDaily',
  getBonus: 'mbGetBonus',
  submitBonus: 'mbSubmitBonus',
  upgrade: 'mbPurchaseUpgrade',
  donate: 'mbDonate',
  devClock: 'mbDevClock',
} as const;

export interface PlayerWeek {
  index: number;
  activated: boolean;
  /** Campaign accumulator value when this student's DPS last changed (see src/game/campaign.ts). */
  accAt: number;
  /** This student's contribution to class DPS (before the Banner bonus). 0 when not activated. */
  dps: number;
  /** Damage already folded in; add dps x (campaign.acc - accAt) for the live figure. */
  damage: number;
  donated: number;
  questions: number;
  firstTry: number;
  currentWrong: number;
  bonus: Record<string, { choice: number; correct: boolean }>;
}

export interface OpRecord {
  id: string;
  kind: string;
  at: number;
  result: unknown;
}

/** classrooms/{cid}/players/{uid}. Written by the server only (clients may read their own). */
export interface PlayerDoc {
  uid: string;
  nickname: string;
  coins: number;
  lifetimeCoins: number;
  upgrades: Upgrades;
  createdAt?: unknown;
  lifetimeQuestions?: number;
  week?: PlayerWeek;
  recentOps?: OpRecord[];
  rl?: { windowStart: number; count: number };
}

export interface PlayerView {
  uid: string;
  nickname: string;
  coins: number;
  lifetimeCoins: number;
  upgrades: Upgrades;
  dps: number;
  activated: boolean;
  weekDamage: number;
  weekDonated: number;
  weekQuestions: number;
  dailyUnlocked: number;
  dailyRemaining: number;
  currentWrong: number;
}

/** A Daily Review or Bonus question as the student sees it: no answer, no hints, no internal seed. */
export interface PublicQuestion {
  id: string;
  skill: SkillKey;
  difficulty: QuestionDifficulty;
  type: 'numeric' | 'choice';
  prompt: string;
  choices?: number[];
}

export interface PublicBonus {
  index: number;
  prompt: string;
  choices: string[];
  /** Present only after the student has answered (the one attempt is then locked). */
  answered: { choice: number; correct: boolean; explanation: string; correctChoice: number } | null;
}

export interface StateReply {
  serverNow: number;
  campaign: CampaignState;
  me: PlayerView | null;
}

export type Fail = { ok: false; code: string; reason: string; hint?: string };
export type Ok<T> = { ok: true; replayed?: boolean } & T;
export type Reply<T> = Ok<T> | Fail;

export interface SyncReq { classroomId: string }
export interface DailyReq extends SyncReq { requestId: string }
export interface SubmitDailyReq extends SyncReq { requestId: string; index: number; answer: string }
export interface SubmitBonusReq extends SyncReq { requestId: string; index: number; choice: number }
export interface UpgradeReq extends SyncReq { requestId: string; key: UpgradeKey; expectedLevel: number; claimedRemaining?: number }
export interface DonateReq extends SyncReq { requestId: string; project: ProjectKey; amount: number }

export type DailyReply = Reply<StateReply & { question: PublicQuestion | null; index: number; wrongCount: number }>;
export type SubmitDailyReply = Reply<StateReply & ({ correct: true; coins: number; attempts: number } | { correct: false; hint: string; wrongCount: number })>;
export type BonusListReply = Reply<StateReply & { enabled: boolean; questions: PublicBonus[] }>;
export type SubmitBonusReply = Reply<StateReply & { correct: boolean; coins: number; explanation: string }>;
export type UpgradeReply = Reply<StateReply & { cost: number; level: number }>;
export type DonateReply = Reply<StateReply & { charged: number; completed: boolean }>;
export type SyncReply = Reply<StateReply>;

/** Contract the UI uses. The Firebase implementation calls Cloud Functions; tests use the in-memory trusted service. */
export interface GameApi {
  sync(classroomId: string): Promise<SyncReply>;
  getDaily(classroomId: string): Promise<DailyReply>;
  submitDaily(classroomId: string, index: number, answer: string): Promise<SubmitDailyReply>;
  getBonus(classroomId: string): Promise<BonusListReply>;
  submitBonus(classroomId: string, index: number, choice: number): Promise<SubmitBonusReply>;
  purchaseUpgrade(classroomId: string, key: UpgradeKey, expectedLevel: number, claimedRemaining?: number): Promise<UpgradeReply>;
  donate(classroomId: string, project: ProjectKey, amount: number): Promise<DonateReply>;
}
