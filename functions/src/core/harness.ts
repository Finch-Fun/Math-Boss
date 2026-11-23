// Test harness: an in-memory classroom with a controllable clock. Used by the unit and "integration" tests (the trusted
// service runs for real; only the Firestore adapter is swapped for MemoryStore).
import { HOUR } from '../../../src/game/constants';
import type { CampaignState } from '../../../src/game/campaign';
import { generateDailyQuestion } from '../../../src/game/questions';
import { defaultSettings } from '../../../src/game/sample';
import type { Settings } from '../../../src/game/types';
import type { PlayerDoc } from '../../../src/cloud/multiplayerTypes';
import { GameService, type Caller } from './service';
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
  player: (uid: string, cid?: string) => PlayerDoc;
  patchCampaign: (fn: (c: CampaignState) => void, cid?: string) => void;
  /** The correct (or deliberately wrong) answer for the student's current Daily Review question. */
  answer: (uid: string, correct: boolean, cid?: string) => Promise<{ index: number; answer: string }>;
  correct: (uid: string, cid?: string) => ReturnType<GameService['submitDaily']>;
  addRoom: (cid: string, ownerUid: string, uids: string[], opts?: { tz?: string; settings?: Settings }) => void;
  hours: (n: number) => void;
}

export function setup(opts: { students?: number; tz?: string; settings?: Partial<Settings>; start?: number } = {}): Room {
  const store = new MemoryStore();
  const clock = { now: opts.start ?? MON_9AM };
  let counter = 0;
  const svc = new GameService({ store, clock: async () => clock.now, newSalt: () => SALT });
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
    campaign: (cid = 'c1') => store.peek<CampaignState>(`classrooms/${cid}/battle/campaign`)!,
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
