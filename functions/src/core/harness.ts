// Test harness: an in-memory classroom with a controllable clock. Used by the unit and "integration" tests (the trusted
// service runs for real; only the Firestore adapter is swapped for MemoryStore).
import { HOUR } from '../../../src/game/constants';
import { settleCampaign, type CampaignState, type RosterEntry } from '../../../src/game/campaign';
import { generateDailyQuestion } from '../../../src/game/questions';
import { defaultSettings } from '../../../src/game/sample';
import type { Settings } from '../../../src/game/types';
import type { PlayerDoc } from '../../../src/cloud/multiplayerTypes';
import { staticBonusBank } from './bonusBank';
import { GameService, normalizeSettings, type Caller } from './service';
import { DEV_BANK } from './testBank';
import { MemoryStore } from './store';

export const SALT = 'testsalt';
/** Monday 2026-01-05 09:00 in America/Chicago (15:00 UTC). */
export const MON_9AM = Date.UTC(2026, 0, 5, 15, 0, 0);
export const TEACHER: Caller = { uid: 'teacher1', email: 'teacher@school.org', emailVerified: true, provider: 'google.com' };

export interface Room {
  store: MemoryStore;
  svc: GameService;
  clock: { now: number };
  cid: string;
  uids: string[];
  as: (uid: string) => Caller;
  rid: () => string;
  campaign: (cid?: string) => CampaignState;
  /** The campaign document exactly as stored (lazily persisted: it can lag behind `campaign()` until something discrete happens). */
  stored: (cid?: string) => CampaignState;
  player: (uid: string, cid?: string) => PlayerDoc;
  patchCampaign: (fn: (c: CampaignState) => void, cid?: string) => void;
  /** The correct (or deliberately wrong) answer for the student's current Daily Review question. */
  answer: (uid: string, correct: boolean, cid?: string) => Promise<{ index: number; answer: string }>;
  correct: (uid: string, cid?: string) => ReturnType<GameService['submitDaily']>;
  addRoom: (cid: string, ownerUid: string, uids: string[], opts?: { tz?: string; settings?: Settings }) => void;
  hours: (n: number) => void;
}

export function setup(opts: { students?: number; tz?: string; settings?: Partial<Settings>; start?: number; noBonusBank?: boolean } = {}): Room {
  const store = new MemoryStore();
  const clock = { now: opts.start ?? MON_9AM };
  let counter = 0;
  const svc = new GameService({ store, clock: async () => clock.now, newSalt: () => SALT, bonusBank: opts.noBonusBank ? undefined : staticBonusBank(DEV_BANK) });
  const n = opts.students ?? 3;
  const uids = Array.from({ length: n }, (_, i) => `u${i + 1}`);
  const room: Room = {
    store,
    svc,
    clock,
    cid: 'c1',
    uids,
    as: (uid) => ({ uid, provider: 'anonymous' }),
    rid: () => `req-${String(++counter).padStart(6, '0')}`,
    stored: (cid = 'c1') => store.peek<CampaignState>(`classrooms/${cid}/battle/campaign`)!,
    // The stored campaign is only persisted when something discrete happens; the settled view at "now" is recomputed
    // deterministically from it, exactly as the server (and the browser projection) does.
    campaign: (cid = 'c1') => {
      const c = store.peek<CampaignState>(`classrooms/${cid}/battle/campaign`)!;
      const cls = store.peek<{ timezone: string; settings: unknown }>(`classrooms/${cid}`)!;
      const roster: RosterEntry[] = store
        .paths(`classrooms/${cid}/members/`)
        .map((path) => store.peek<{ uid: string; status: string }>(path)!)
        .filter((m) => m.status === 'active')
        .map((m) => {
          const pl = store.peek<PlayerDoc>(`classrooms/${cid}/players/${m.uid}`);
          return { uid: m.uid, upgrades: pl?.upgrades ?? { damage: 0, speed: 0, critChance: 0, critDamage: 0 }, coins: pl?.coins ?? 0 };
        });
      settleCampaign(c, clock.now, { timeZone: cls.timezone, settings: normalizeSettings(cls.settings) }, { roster });
      return c;
    },
    player: (uid, cid = 'c1') => store.peek<PlayerDoc>(`classrooms/${cid}/players/${uid}`)!,
    patchCampaign: (fn, cid = 'c1') => {
      const c = store.peek<CampaignState>(`classrooms/${cid}/battle/campaign`)!;
      fn(c);
      store.seed(`classrooms/${cid}/battle/campaign`, c as never);
    },
    answer: async (uid, correct, cid = 'c1') => {
      const d = await svc.getDaily(room.as(uid), { classroomId: cid, requestId: room.rid() });
      if (!d.ok || !d.question) throw new Error('no question');
      const settings = { ...defaultSettings(), ...(opts.settings ?? {}) };
      const q = generateDailyQuestion({ studentId: `${SALT}:${uid}`, weekIndex: d.campaign.weekIndex, index: d.index, preset: settings.difficultyPreset, skills: settings.skills });
      return { index: d.index, answer: String(correct ? q.answer : q.answer + 1) };
    },
    correct: async (uid, cid = 'c1') => {
      const a = await room.answer(uid, true, cid);
      return svc.submitDaily(room.as(uid), { classroomId: cid, requestId: room.rid(), index: a.index, answer: a.answer });
    },
    addRoom: (cid, ownerUid, ids, o = {}) => {
      store.seed(`classrooms/${cid}`, { ownerUid, name: cid, timezone: o.tz ?? opts.tz ?? 'America/Chicago', status: 'active', settings: { ...defaultSettings(), ...(o.settings ?? {}) } });
      store.seed(`teacherAllowlist/${TEACHER.email}`, { addedBy: 'console' });
      for (const uid of ids) store.seed(`classrooms/${cid}/members/${uid}`, { uid, displayName: `Kid ${uid}`, status: 'active', requestedAt: clock.now - 1000 });
    },
    hours: (h) => {
      clock.now += h * HOUR;
    },
  };
  room.addRoom('c1', TEACHER.uid, uids, { tz: opts.tz, settings: opts.settings as Settings });
  return room;
}
