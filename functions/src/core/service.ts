// The trusted game service. Every rule that matters is enforced here, in code that runs on the server:
//   * identity comes from the verified auth token (never from the request body);
//   * the caller must be an ACTIVE member of the named classroom (teachers cannot act as students);
//   * requests carry intents only; unknown fields are rejected, so "coins", "damage", "reward" or "now" cannot be smuggled in;
//   * the server clock decides time; combat is settled up to it before any state changes;
//   * each operation is one transaction over the caller's player doc and the classroom's campaign doc.
// Admin SDK writes bypass Firestore rules, so nothing here relies on rules for correctness.
import { randomBytes } from 'node:crypto';
import { BONUS_REWARD, PROJECT_KEYS, UPGRADE_DEFS, UPGRADE_KEYS } from '../../../src/game/constants';
import {
  applyZeroWeek,
  beginWeek,
  changeStudentDps,
  fundProject,
  isCampaignProjectMaxed,
  isZeroQuestionWeek,
  newCampaign,
  personalDps,
  questionRepair,
  removeStudentDps,
  settleCampaign,
  settlementNeedsRoster,
  type CampaignState,
  type RosterEntry,
  type SettleContext,
} from '../../../src/game/campaign';
import { coinsForAttempts } from '../../../src/game/actions';
import { generateDailyQuestion, hintFor, parseAnswer, ALL_SKILLS } from '../../../src/game/questions';
import { bonusForWeek, type BonusBankSource } from './bonusBank';
import { defaultSettings } from '../../../src/game/sample';
import { isMaxed, upgradeCost } from '../../../src/game/upgrades';
import { weekdayIndexZ, isValidTimeZone } from '../../../src/game/zoned';
import type { ProjectKey, Settings, UpgradeKey } from '../../../src/game/types';
import type {
  BonusListReply,
  DailyReply,
  DailyReq,
  DonateReply,
  DonateReq,
  Fail,
  OpRecord,
  PlayerDoc,
  PlayerView,
  PlayerWeek,
  PublicQuestion,
  RemoveStudentReply,
  RemoveStudentReq,
  StateReply,
  SubmitBonusReply,
  SubmitBonusReq,
  SubmitDailyReply,
  SubmitDailyReq,
  SyncReply,
  SyncReq,
  UpgradeReply,
  UpgradeReq,
} from '../../../src/cloud/multiplayerTypes';
import { ServiceError } from './errors';
import type { ClockSource, Doc, DocStore, Tx } from './store';

export interface Caller {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  provider?: string;
}

export const LIMITS = {
  /** Accepted mutating operations per player per minute. */
  opsPerMinute: 40,
  recentOps: 25,
  /** A read-style request settles combat only if at least this much time has passed (cuts writes; mutations always settle). */
  minSettleMs: 5_000,
  maxDonation: 1_000_000,
  /** Upper bound on roster reads inside one transaction (a class is 10 to 40 students). */
  maxRoster: 200,
};

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const path = {
  classroom: (cid: string) => `classrooms/${cid}`,
  member: (cid: string, uid: string) => `classrooms/${cid}/members/${uid}`,
  members: (cid: string) => `classrooms/${cid}/members`,
  player: (cid: string, uid: string) => `classrooms/${cid}/players/${uid}`,
  campaign: (cid: string) => `classrooms/${cid}/battle/campaign`,
  secrets: (cid: string) => `classrooms/${cid}/serverOnly/secrets`,
  allowlist: (email: string) => `teacherAllowlist/${email.toLowerCase()}`,
};

const msOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
};

/** Teacher-written settings are validated again here; the server never assumes the document is well formed. */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const dq = Array.from({ length: 7 }, (_, i) => {
    const n = Math.round(Number(r.dailyQuestions?.[i] ?? d.dailyQuestions[i]));
    return Math.min(20, Math.max(0, Number.isFinite(n) ? n : 0));
  });
  const skills = (Array.isArray(r.skills) ? r.skills : []).filter((k) => ALL_SKILLS.includes(k));
  return {
    requireMathForUpgrades: r.requireMathForUpgrades === true,
    dailyQuestions: dq,
    difficultyPreset: r.difficultyPreset === 'foundations' || r.difficultyPreset === 'challenge' ? r.difficultyPreset : 'balanced',
    skills: skills.length ? skills : d.skills,
    bossDifficulty: r.bossDifficulty === 'easy' || r.bossDifficulty === 'hard' ? r.bossDifficulty : 'normal',
    bonusEnabled: r.bonusEnabled !== false,
  };
}

function exactKeys(req: unknown, allowed: string[]): Record<string, unknown> {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw new ServiceError('invalid-argument', 'Malformed request.');
  const r = req as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!allowed.includes(k)) throw new ServiceError('invalid-argument', `Unexpected field "${k}". The server decides rewards, damage and time.`);
  if (typeof r.classroomId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.classroomId)) throw new ServiceError('invalid-argument', 'Invalid classroom.');
  if (allowed.includes('requestId') && (typeof r.requestId !== 'string' || !REQUEST_ID.test(r.requestId))) throw new ServiceError('invalid-argument', 'Invalid request id.');
  return r;
}

/** Everything about the campaign except values that are pure functions of elapsed time (they are recomputed deterministically). */
function campaignSignature(c: CampaignState): string {
  const { lastSettledAt: _t, acc: _a, castleHp: _h, boss, ...rest } = c;
  return JSON.stringify([rest, boss ? { ...boss, hp: 0 } : null]);
}

const fail = (code: string, reason: string, hint?: string): Fail => ({ ok: false, code, reason, ...(hint ? { hint } : {}) });

interface Prep {
  tx: Tx;
  cid: string;
  uid: string;
  now: number;
  tz: string;
  settings: Settings;
  campaign: CampaignState;
  player: PlayerDoc | null;
  joinedAt: number | null;
  isTeacher: boolean;
  campaignDirty: boolean;
  playerDirty: boolean;
  roster: RosterEntry[] | null;
  salt: string;
}

type Core = { ok: true } & Doc;
type BodyResult = Core | Fail;

export interface ServiceOptions {
  store: DocStore;
  clock: ClockSource;
  /** Overridable for deterministic tests. */
  newSalt?: () => string;
  /** The private Bonus Question bank. Without one, Bonus Questions are unavailable (fail closed); there is no public fallback. */
  bonusBank?: BonusBankSource;
}

export class GameService {
  private store: DocStore;
  private clock: ClockSource;
  private newSalt: () => string;
  private bonusBank: BonusBankSource;

  constructor(opts: ServiceOptions) {
    this.store = opts.store;
    this.clock = opts.clock;
    this.newSalt = opts.newSalt ?? (() => randomBytes(16).toString('hex'));
    this.bonusBank = opts.bonusBank ?? { load: async () => null };
  }

  // ------------------------------------------------------------------ public operations
  async sync(caller: Caller, req: SyncReq): Promise<SyncReply> {
    const r = exactKeys(req, ['classroomId']);
    return this.run(caller, r.classroomId as string, 'sync', { mutating: false, teacherOk: true, settle: 'lazy' }, () => ({ ok: true })) as Promise<SyncReply>;
  }

  async getDaily(caller: Caller, req: DailyReq): Promise<DailyReply> {
    const r = exactKeys(req, ['classroomId', 'requestId']);
    return this.run(caller, r.classroomId as string, 'getDaily', { mutating: false, settle: 'lazy' }, (p) => {
      const { question, index } = this.currentQuestion(p);
      return { ok: true, question: question ? publicQuestion(question, p.campaign.weekIndex, index) : null, index, wrongCount: p.player!.week!.currentWrong };
    }) as Promise<DailyReply>;
  }

  async submitDaily(caller: Caller, req: SubmitDailyReq): Promise<SubmitDailyReply> {
    const r = exactKeys(req, ['classroomId', 'requestId', 'index', 'answer']);
    if (!Number.isInteger(r.index) || (r.index as number) < 0) throw new ServiceError('invalid-argument', 'Invalid question index.');
    if (typeof r.answer !== 'string' || r.answer.length > 32) throw new ServiceError('invalid-argument', 'Invalid answer.');
    return this.run(caller, r.classroomId as string, 'submitDaily', { mutating: true, requestId: r.requestId as string, settle: 'force' }, (p) => {
      const player = p.player!;
      const week = player.week!;
      const { question, index } = this.currentQuestion(p);
      if (!question) return fail('no-question', 'No Daily Review question is available right now.');
      if (r.index !== index) return fail('stale', 'That question was already completed. Loading your current question.');
      const value = parseAnswer(r.answer as string);
      if (value === null) return fail('not-a-number', 'Please enter a number.');
      if (value !== question.answer) {
        week.currentWrong += 1;
        return { ok: true, correct: false, hint: hintFor(question, week.currentWrong) ?? '', wrongCount: week.currentWrong };
      }
      const attempts = week.currentWrong + 1;
      const coins = coinsForAttempts(attempts);
      player.coins += coins;
      player.lifetimeCoins += coins;
      player.lifetimeQuestions = (player.lifetimeQuestions ?? 0) + 1;
      week.questions += 1;
      if (attempts === 1) week.firstTry += 1;
      week.currentWrong = 0;
      p.campaign.stats.questions += 1;
      if (!week.activated) this.activate(p); // weekly activation: one correct Daily Review answer
      questionRepair(p.campaign, p.now);
      return { ok: true, correct: true, coins, attempts };
    }) as Promise<SubmitDailyReply>;
  }

  async getBonus(caller: Caller, req: DailyReq): Promise<BonusListReply> {
    const r = exactKeys(req, ['classroomId', 'requestId']);
    const bank = await this.bonusBank.load();
    return this.run(caller, r.classroomId as string, 'getBonus', { mutating: false, settle: 'lazy' }, (p) => {
      if (!p.settings.bonusEnabled || !bank) return { ok: true, enabled: false, questions: [] };
      const week = p.player!.week!;
      const questions = bonusForWeek(bank, p.campaign.weekIndex).map((q, index) => {
        const a = week.bonus[`${p.campaign.weekIndex}:${index}`];
        return {
          index,
          prompt: q.prompt,
          choices: q.choices,
          answered: a ? { choice: a.choice, correct: a.correct, explanation: q.explanation, correctChoice: q.correct } : null,
        };
      });
      return { ok: true, enabled: true, questions };
    }) as Promise<BonusListReply>;
  }

  async submitBonus(caller: Caller, req: SubmitBonusReq): Promise<SubmitBonusReply> {
    const r = exactKeys(req, ['classroomId', 'requestId', 'index', 'choice']);
    if (!Number.isInteger(r.index) || !Number.isInteger(r.choice)) throw new ServiceError('invalid-argument', 'Invalid choice.');
    const bank = await this.bonusBank.load();
    return this.run(caller, r.classroomId as string, 'submitBonus', { mutating: true, requestId: r.requestId as string, settle: 'force' }, (p) => {
      if (!p.settings.bonusEnabled || !bank) return fail('disabled', 'Bonus Questions are not available right now.');
      const player = p.player!;
      const question = bonusForWeek(bank, p.campaign.weekIndex)[r.index as number];
      if (!question) return fail('unknown', 'Unknown bonus question.');
      const key = `${p.campaign.weekIndex}:${r.index}`;
      if (player.week!.bonus[key]) return fail('locked', 'This question is already answered and locked.'); // one attempt, no retry through the API
      if ((r.choice as number) < 0 || (r.choice as number) >= question.choices.length) return fail('bad-choice', 'Pick one of the choices.');
      const correct = r.choice === question.correct;
      const coins = correct ? BONUS_REWARD : 0;
      player.week!.bonus[key] = { choice: r.choice as number, correct };
      player.coins += coins;
      player.lifetimeCoins += coins;
      return { ok: true, correct, coins, explanation: question.explanation };
    }) as Promise<SubmitBonusReply>;
  }

  async purchaseUpgrade(caller: Caller, req: UpgradeReq): Promise<UpgradeReply> {
    const r = exactKeys(req, ['classroomId', 'requestId', 'key', 'expectedLevel', 'claimedRemaining']);
    if (typeof r.key !== 'string' || !UPGRADE_KEYS.includes(r.key as UpgradeKey)) throw new ServiceError('invalid-argument', 'Unknown upgrade.');
    if (!Number.isInteger(r.expectedLevel)) throw new ServiceError('invalid-argument', 'Invalid level.');
    if (r.claimedRemaining !== undefined && !Number.isInteger(r.claimedRemaining)) throw new ServiceError('invalid-argument', 'Invalid answer.');
    const key = r.key as UpgradeKey;
    return this.run(caller, r.classroomId as string, 'upgrade', { mutating: true, requestId: r.requestId as string, settle: 'force' }, (p) => {
      const player = p.player!;
      if (player.upgrades[key] !== r.expectedLevel) return fail('stale', 'That upgrade has already changed. Your view was out of date.');
      if (isMaxed(player.upgrades, key)) return fail('maxed', `${UPGRADE_DEFS[key].label} is at its maximum level.`);
      const cost = upgradeCost(key, player.upgrades[key]);
      if (player.coins < cost) return fail('coins', `Not enough coins. You need ${cost - player.coins} more.`);
      if (p.settings.requireMathForUpgrades) {
        if (r.claimedRemaining === undefined) return fail('math', 'Enter your remaining balance to complete this purchase.');
        if (r.claimedRemaining !== player.coins - cost) {
          return fail('math', 'That is not quite right.', `Subtract the price from your coins: ${player.coins} − ${cost}. Count back carefully, then try again.`);
        }
      }
      this.foldDamage(p); // damage so far is credited at the old DPS before the new DPS applies
      player.coins -= cost;
      player.upgrades[key] += 1;
      const week = player.week!;
      if (week.activated) {
        const next = personalDps(player.upgrades);
        changeStudentDps(p.campaign, week.dps, next, false, p.now);
        week.dps = next;
      }
      return { ok: true, cost, level: player.upgrades[key] };
    }) as Promise<UpgradeReply>;
  }

  async donate(caller: Caller, req: DonateReq): Promise<DonateReply> {
    const r = exactKeys(req, ['classroomId', 'requestId', 'project', 'amount']);
    if (typeof r.project !== 'string' || !PROJECT_KEYS.includes(r.project as ProjectKey)) throw new ServiceError('invalid-argument', 'Unknown project.');
    if (!Number.isInteger(r.amount) || (r.amount as number) < 1 || (r.amount as number) > LIMITS.maxDonation) {
      throw new ServiceError('invalid-argument', 'Enter a whole number of coins (1 or more).');
    }
    const key = r.project as ProjectKey;
    return this.run(caller, r.classroomId as string, 'donate', { mutating: true, requestId: r.requestId as string, settle: 'force' }, (p) => {
      const player = p.player!;
      if (isCampaignProjectMaxed(p.campaign, key)) return fail('maxed', 'That project is already at its maximum this week.');
      if ((r.amount as number) > player.coins) return fail('coins', 'You do not have that many coins.');
      const { charged, completed } = fundProject(p.campaign, key, r.amount as number, p.now);
      player.coins -= charged;
      player.week!.donated += charged;
      return { ok: true, charged, completed };
    }) as Promise<DonateReply>;
  }

  /**
   * Teacher-only. Takes a student out of the class at the SERVER's current time: combat is settled up to that instant (so the
   * student's damage until then is counted), then their DPS stops contributing to the shared campaign. This is the only path
   * that deactivates an active member (the Firestore rules refuse a direct client write), so a removal can never be missed by
   * settlement, whether the class is online or idle. Safe to repeat. Concurrent student requests serialize with it in the transaction.
   */
  async removeStudent(caller: Caller, req: RemoveStudentReq): Promise<RemoveStudentReply> {
    const r = exactKeys(req, ['classroomId', 'studentId']);
    if (typeof r.studentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.studentId)) throw new ServiceError('invalid-argument', 'Invalid student.');
    const cid = r.classroomId as string;
    const sid = r.studentId;
    if (!caller || typeof caller.uid !== 'string' || !caller.uid) throw new ServiceError('unauthenticated', 'Please sign in.');
    return this.store.runTransaction(async (tx) => {
      const [classroom, member, playerRaw, campaignRaw] = await tx.getMany<Doc>([path.classroom(cid), path.member(cid, sid), path.player(cid, sid), path.campaign(cid)]);
      if (!classroom || classroom.ownerUid !== caller.uid || !(await this.isAllowlistedTeacher(tx, caller))) {
        throw new ServiceError('permission-denied', 'Only the classroom owner can remove students.');
      }
      if (!member) throw new ServiceError('not-found', 'That student is not in this classroom.');
      const now = await this.clock(tx);
      if (member.status !== 'active') return { ok: true, removed: false, wasContributing: false, effectiveAt: now };

      const tz = typeof classroom.timezone === 'string' && isValidTimeZone(classroom.timezone) ? classroom.timezone : 'UTC';
      const p: Prep = {
        tx, cid, uid: sid, now, tz,
        settings: normalizeSettings(classroom.settings),
        campaign: (campaignRaw as unknown as CampaignState | undefined) ?? newCampaign(now, tz),
        player: (playerRaw as unknown as PlayerDoc | undefined) ?? null,
        joinedAt: msOf(member.approvedAt) ?? msOf(member.requestedAt),
        isTeacher: false, campaignDirty: !campaignRaw, playerDirty: false, roster: null, salt: '',
      };
      // 1. Settle to the effective removal time. The student is still an active member here, so everything up to `now` includes them.
      await this.settleTo(p, 'force');
      const c = p.campaign;

      // 2. Work out whether they are counted in the aggregate DPS this week, and with how much.
      const zero = { damage: 0, speed: 0, critChance: 0, critDamage: 0 };
      const upgrades = p.player?.upgrades ?? zero;
      const week = p.player?.week;
      let contributing = 0;
      if (week && week.index === c.weekIndex) {
        if (week.activated) {
          this.foldDamageOf(c, week);
          contributing = week.dps;
        }
      } else if (c.zeroWeekAppliedFor === c.weekIndex && p.joinedAt !== null && p.joinedAt <= c.zeroWeekAt) {
        contributing = personalDps(upgrades); // counted by the zero-question roster snapshot without ever opening the app
      }
      const wasContributing = contributing > 0 || (!!week && week.index === c.weekIndex && week.activated);
      if (wasContributing) {
        removeStudentDps(c, contributing);
        p.campaignDirty = true;
      }
      // Always leave a player record whose week is marked inactive, so a later restore is never mistaken for "already counted".
      p.player ??= { uid: sid, nickname: String(member.displayName ?? 'Student'), coins: 0, lifetimeCoins: 0, upgrades, createdAt: now };
      {
        const w = week && week.index === c.weekIndex ? week : { index: c.weekIndex, activated: false, accAt: 0, dps: 0, damage: 0, donated: 0, questions: 0, firstTry: 0, currentWrong: 0, bonus: {} };
        w.activated = false;
        w.dps = 0;
        w.accAt = c.acc;
        p.player.week = w;
        tx.set(path.player(cid, sid), p.player as unknown as Doc);
      }
      tx.set(path.member(cid, sid), { ...member, status: 'removed', removedAt: now, removedBy: caller.uid });
      if (p.campaignDirty) tx.set(path.campaign(cid), c as unknown as Doc);
      return { ok: true, removed: true, wasContributing, effectiveAt: now };
    }) as Promise<RemoveStudentReply>;
  }

  private foldDamageOf(c: CampaignState, w: PlayerWeek): void {
    if (w.activated) w.damage += Math.max(0, w.dps * (c.acc - w.accAt));
    w.accAt = c.acc;
  }

  // ------------------------------------------------------------------ transaction runner
  private async run(
    caller: Caller,
    cid: string,
    kind: string,
    opts: { mutating: boolean; teacherOk?: boolean; requestId?: string; settle: 'lazy' | 'force' },
    body: (p: Prep) => BodyResult | Promise<BodyResult>,
  ): Promise<never> {
    if (!caller || typeof caller.uid !== 'string' || !caller.uid) throw new ServiceError('unauthenticated', 'Please sign in.');
    return this.store.runTransaction(async (tx) => {
      const [classroom, member, playerRaw, campaignRaw, secretsRaw] = await tx.getMany<Doc>([
        path.classroom(cid),
        path.member(cid, caller.uid),
        path.player(cid, caller.uid),
        path.campaign(cid),
        path.secrets(cid),
      ]);
      const now = await this.clock(tx);

      let isTeacher = false;
      const activeMember = !!member && member.status === 'active' && member.uid === caller.uid;
      if (!activeMember) {
        // Not a student of this classroom. Only the owning, allowlisted teacher may call `sync` (read-style, no student state).
        if (opts.teacherOk && classroom && classroom.ownerUid === caller.uid && (await this.isAllowlistedTeacher(tx, caller))) isTeacher = true;
        else throw new ServiceError('permission-denied', 'You are not an active member of this classroom.');
      }
      if (!classroom) throw new ServiceError('not-found', 'Classroom not found.');
      if (classroom.status !== 'active') throw new ServiceError('failed-precondition', 'This classroom is archived.');
      const tz = typeof classroom.timezone === 'string' && isValidTimeZone(classroom.timezone) ? classroom.timezone : 'UTC';

      const prep: Prep = {
        tx,
        cid,
        uid: caller.uid,
        now,
        tz,
        settings: normalizeSettings(classroom.settings),
        campaign: (campaignRaw as unknown as CampaignState | undefined) ?? newCampaign(now, tz),
        player: null,
        joinedAt: member ? (msOf(member.approvedAt) ?? msOf(member.requestedAt)) : null,
        isTeacher,
        campaignDirty: !campaignRaw,
        playerDirty: false,
        roster: null,
        salt: typeof secretsRaw?.questionSalt === 'string' ? secretsRaw.questionSalt : '',
      };
      if (!prep.salt) {
        prep.salt = this.newSalt();
        tx.set(path.secrets(cid), { questionSalt: prep.salt }); // server-only document (default-deny in the rules)
      }

      if (!isTeacher) {
        prep.player = (playerRaw as unknown as PlayerDoc | undefined) ?? {
          uid: caller.uid,
          nickname: String(member?.displayName ?? 'Student'),
          coins: 0,
          lifetimeCoins: 0,
          upgrades: { damage: 0, speed: 0, critChance: 0, critDamage: 0 },
          createdAt: now,
        };
        prep.playerDirty = !playerRaw;
        // Idempotency: a repeated request id returns the first outcome and changes nothing.
        if (opts.requestId) {
          const prior = prep.player.recentOps?.find((o) => o.id === opts.requestId);
          if (prior) {
            if (prior.kind !== kind) throw new ServiceError('invalid-argument', 'That request id was used for a different operation.');
            await this.settleTo(prep, 'lazy');
            this.prepareWeek(prep);
            return { ...(prior.result as Doc), replayed: true, ...this.stateReply(prep) };
          }
        }
        if (opts.mutating) this.rateLimit(prep);
      }

      await this.settleTo(prep, opts.settle);
      const sigBefore = campaignSignature(prep.campaign);
      if (!isTeacher) this.prepareWeek(prep);

      const core = await body(prep);
      if (!core.ok) return { ...core }; // business rejection: nothing is written

      if (!isTeacher && opts.requestId) {
        const ops: OpRecord[] = [...(prep.player!.recentOps ?? []), { id: opts.requestId, kind, at: now, result: core }];
        prep.player!.recentOps = ops.slice(-LIMITS.recentOps);
      }
      if (!isTeacher && (opts.mutating || prep.playerDirty)) prep.playerDirty = true;
      if (campaignSignature(prep.campaign) !== sigBefore) prep.campaignDirty = true; // the operation changed shared state (not just time)
      if (prep.campaignDirty) tx.set(path.campaign(cid), prep.campaign as unknown as Doc);
      if (!isTeacher && prep.playerDirty) tx.set(path.player(cid, caller.uid), prep.player as unknown as Doc);
      return { ...core, ...this.stateReply(prep) };
    }) as Promise<never>;
  }

  private async isAllowlistedTeacher(tx: Tx, caller: Caller): Promise<boolean> {
    if (caller.provider !== 'google.com' || caller.emailVerified !== true || !caller.email) return false;
    return !!(await tx.get(path.allowlist(caller.email)));
  }

  private rateLimit(p: Prep): void {
    const player = p.player!;
    let rl = player.rl ?? { windowStart: p.now, count: 0 };
    if (p.now - rl.windowStart >= 60_000 || p.now < rl.windowStart) rl = { windowStart: p.now, count: 0 };
    if (rl.count >= LIMITS.opsPerMinute) throw new ServiceError('resource-exhausted', 'Too many requests. Please slow down.');
    player.rl = { windowStart: rl.windowStart, count: rl.count + 1 };
    p.playerDirty = true;
  }

  // ------------------------------------------------------------------ settlement
  private async loadRoster(p: Prep): Promise<RosterEntry[]> {
    if (p.roster) return p.roster;
    const members = await p.tx.list<Doc>(path.members(p.cid), { field: 'status', equals: 'active' }, LIMITS.maxRoster + 1);
    if (members.length > LIMITS.maxRoster) throw new ServiceError('failed-precondition', `A classroom can have at most ${LIMITS.maxRoster} active students.`);
    const uids = members.map(([id]) => id);
    const players = await p.tx.getMany<PlayerDoc>(uids.map((u) => path.player(p.cid, u)));
    p.roster = uids.map((uid, i) => ({
      uid,
      upgrades: players[i]?.upgrades ?? { damage: 0, speed: 0, critChance: 0, critDamage: 0 },
      coins: players[i]?.coins ?? 0,
    }));
    return p.roster;
  }

  private ctx(p: Prep): SettleContext {
    return { timeZone: p.tz, settings: p.settings, rosterAt: p.now };
  }

  private async settleTo(p: Prep, mode: 'lazy' | 'force'): Promise<void> {
    const c = p.campaign;
    const fresh = c.weekIndex === 0;
    if (!fresh && mode === 'lazy' && p.now < c.weekEnd && p.now - c.lastSettledAt < LIMITS.minSettleMs) return;
    if (!fresh && p.now <= c.lastSettledAt) return;
    const ctx = this.ctx(p);
    if (fresh) {
      const roster = await this.loadRoster(p);
      beginWeek(c, p.now, c.weekStart, ctx, roster);
    }
    const roster = fresh || settlementNeedsRoster(c, p.now, ctx) ? await this.loadRoster(p) : undefined;
    const settled = settleCampaign(c, p.now, ctx, { roster });
    // Settlement is deterministic from the stored state, so a pure advance of time does NOT need to be written (every write is
    // delivered to every listening student). Persist only when something discrete happened (a boss fell, a week turned...).
    if (fresh || settled.events > 0 || settled.skippedWeeks > 0) p.campaignDirty = true;
    // A teacher who switches to a zero-question week mid-week activates everyone (design §10.1).
    if (isZeroQuestionWeek(p.settings) && c.zeroWeekAppliedFor !== c.weekIndex) {
      applyZeroWeek(c, await this.loadRoster(p), p.now, p.now);
      p.campaignDirty = true;
    }
  }

  // ------------------------------------------------------------------ player week state
  /** Lazily brings the player's weekly state up to the campaign's current week. Permanent progress is never touched. */
  private prepareWeek(p: Prep): void {
    const c = p.campaign;
    const player = p.player!;
    if (!player.week || player.week.index !== c.weekIndex) {
      const week: PlayerWeek = { index: c.weekIndex, activated: false, accAt: 0, dps: 0, damage: 0, donated: 0, questions: 0, firstTry: 0, currentWrong: 0, bonus: {} };
      player.week = week;
      p.playerDirty = true;
      const zeroApplied = c.zeroWeekAppliedFor === c.weekIndex;
      // Students on the roster when the zero-question rule ran were already counted in the class DPS.
      if (zeroApplied && p.joinedAt !== null && p.joinedAt <= c.zeroWeekAt) {
        week.activated = true;
        week.dps = personalDps(player.upgrades);
        week.accAt = c.zeroWeekAcc;
      }
    }
    if (isZeroQuestionWeek(p.settings) && c.zeroWeekAppliedFor === c.weekIndex && !player.week.activated) {
      this.activate(p); // joined after the rule ran
      p.playerDirty = true;
    }
  }

  private foldDamage(p: Prep): void {
    const w = p.player!.week!;
    if (w.activated) w.damage += Math.max(0, w.dps * (p.campaign.acc - w.accAt));
    w.accAt = p.campaign.acc;
  }

  private activate(p: Prep): void {
    const w = p.player!.week!;
    if (w.activated) return;
    const dps = personalDps(p.player!.upgrades);
    w.activated = true;
    w.accAt = p.campaign.acc;
    w.dps = dps;
    changeStudentDps(p.campaign, 0, dps, true, p.now);
  }

  // ------------------------------------------------------------------ questions & views
  private dailyUnlocked(p: Prep): number {
    const today = weekdayIndexZ(p.now, p.tz);
    let total = 0;
    for (let i = 0; i <= today; i++) total += p.settings.dailyQuestions[i] ?? 0;
    return total;
  }

  private currentQuestion(p: Prep) {
    const week = p.player!.week!;
    const index = week.questions;
    if (this.dailyUnlocked(p) - index <= 0) return { question: null, index };
    return {
      index,
      // The per-classroom secret salt makes the question stream unguessable even though the generator code is public.
      question: generateDailyQuestion({
        studentId: `${p.salt}:${p.uid}`,
        weekIndex: p.campaign.weekIndex,
        index,
        preset: p.settings.difficultyPreset,
        skills: p.settings.skills,
      }),
    };
  }

  private stateReply(p: Prep): StateReply {
    const player = p.player;
    let me: PlayerView | null = null;
    if (player) {
      const w = player.week;
      const unlocked = this.dailyUnlocked(p);
      me = {
        uid: player.uid,
        nickname: player.nickname,
        coins: player.coins,
        lifetimeCoins: player.lifetimeCoins,
        upgrades: player.upgrades,
        dps: w?.activated ? w.dps : 0,
        activated: !!w?.activated,
        weekDamage: w ? w.damage + (w.activated ? Math.max(0, w.dps * (p.campaign.acc - w.accAt)) : 0) : 0,
        weekDonated: w?.donated ?? 0,
        weekQuestions: w?.questions ?? 0,
        dailyUnlocked: unlocked,
        dailyRemaining: Math.max(0, unlocked - (w?.questions ?? 0)),
        currentWrong: w?.currentWrong ?? 0,
      };
    }
    return { serverNow: p.now, campaign: p.campaign, me };
  }
}

function publicQuestion(q: ReturnType<typeof generateDailyQuestion>, week: number, index: number): PublicQuestion {
  // The generator's own id embeds the secret seed, so a neutral id is used. Answer and hints are never included.
  return { id: `${week}:${index}`, skill: q.skill, difficulty: q.difficulty, type: q.type, prompt: q.prompt, choices: q.choices };
}
