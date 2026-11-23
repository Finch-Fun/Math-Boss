// The only module that imports the Firebase SDK. The UI loads it with a dynamic import, so demo mode never pulls it in.
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { readFirebaseConfig, type Env } from './config';
import { FUNCTION_NAMES, type GameApi, type PlayerDoc } from './multiplayerTypes';
import type { CampaignState } from '../game/campaign';
import { CloudError, toCloudError } from './errors';
import { COL, classroomFields, classroomFromDoc, initialPlayerFields, memberFromDoc, playerFromDoc } from './model';
import type { AuthService, Classroom, ClassroomInput, Cloud, CloudUser, JoinPreview, Member, MyClassroom, RosterEntry, StudentService, TeacherService } from './types';
import { generateJoinCode, normalizeJoinCode, validateDisplayName } from './validation';

const toUser = (u: User): CloudUser => ({ uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, displayName: u.displayName });

export function createCloud(env: Env): Cloud {
  const cfg = readFirebaseConfig(env);
  if (!cfg.ok) throw new CloudError('config_missing', `Firebase is not configured. Missing: ${cfg.missing.join(', ')}. See docs/FIREBASE_SETUP.md.`);

  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(cfg.config);
  const auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  if (cfg.useEmulator && !(globalThis as { __mbEmu?: boolean }).__mbEmu) {
    (globalThis as { __mbEmu?: boolean }).__mbEmu = true;
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001);
  }

  const uid = (): string => {
    const u = auth.currentUser;
    if (!u) throw new CloudError('permission_denied', 'Please sign in first.');
    return u.uid;
  };
  const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw toCloudError(e);
    }
  };

  const authService: AuthService = {
    onChange: (cb) => onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)),
    signInWithGoogle: () => wrap(async () => toUser((await signInWithPopup(auth, new GoogleAuthProvider())).user)),
    signInAnonymously: () => wrap(async () => toUser((await fbSignInAnonymously(auth)).user)),
    linkGoogleToStudent: () =>
      wrap(async () => {
        const u = auth.currentUser;
        if (!u || !u.isAnonymous) throw new CloudError('invalid_input', 'Only an anonymous student session can be linked to a Google account.');
        return toUser((await linkWithPopup(u, new GoogleAuthProvider())).user);
      }),
    signOut: () => wrap(() => fbSignOut(auth)),
  };

  const classroomRef = (id: string) => doc(db, COL.classrooms, id);
  const memberRef = (cid: string, u: string) => doc(db, COL.classrooms, cid, COL.members, u);
  const playerRef = (cid: string, u: string) => doc(db, COL.classrooms, cid, COL.players, u);
  const loadClassroom = async (id: string): Promise<Classroom> => {
    const snap = await getDoc(classroomRef(id));
    if (!snap.exists()) throw new CloudError('invalid_input', 'That classroom no longer exists.');
    return classroomFromDoc(snap.id, snap.data());
  };
  const codeFields = (ownerUid: string, c: { id: string; name: string; joinApproval: string }) => ({
    classroomId: c.id,
    ownerUid,
    classroomName: c.name,
    joinApproval: c.joinApproval,
  });

  const teacher: TeacherService = {
    ensureProfile: (user) =>
      wrap(async () => {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, COL.teacherProfiles, user.uid), {
            displayName: user.displayName ?? user.email ?? 'Teacher',
            email: user.email,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
          return 'approved';
        } catch (e) {
          // The rules allow this write only for allowlisted, verified Google accounts; denial means "not approved".
          if (typeof e === 'object' && e && (e as { code?: string }).code === 'permission-denied') return 'not_approved';
          throw e;
        }
      }),

    createClassroom: (input: ClassroomInput) =>
      wrap(async () => {
        const owner = uid();
        const id = doc(collection(db, COL.classrooms)).id;
        for (let attempt = 0; attempt < 5; attempt++) {
          const joinCode = generateJoinCode();
          const batch = writeBatch(db);
          batch.set(classroomRef(id), { ...classroomFields(owner, input, joinCode), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          batch.set(doc(db, COL.joinCodes, joinCode), codeFields(owner, { id, name: input.name, joinApproval: input.joinApproval }));
          try {
            await batch.commit();
            return await loadClassroom(id);
          } catch (e) {
            // A taken code looks like a denied update of an existing joinCodes doc: pick another code and retry.
            if ((e as { code?: string }).code !== 'permission-denied' || attempt === 4) throw e;
          }
        }
        throw new CloudError('code_collision', 'Could not allocate a unique join code. Please try again.');
      }),

    listClassrooms: () =>
      wrap(async () => {
        const snap = await getDocs(query(collection(db, COL.classrooms), where('ownerUid', '==', uid())));
        return snap.docs
          .map((d) => classroomFromDoc(d.id, d.data()))
          .sort((a, b) => (b.createdAt ?? Date.now()) - (a.createdAt ?? Date.now()));
      }),

    updateClassroom: (c, patch) =>
      wrap(async () => {
        const next = { ...c, ...patch };
        const batch = writeBatch(db);
        batch.update(classroomRef(c.id), { ...classroomFields(c.ownerUid, next, c.joinCode, c.status), updatedAt: serverTimestamp() });
        batch.update(doc(db, COL.joinCodes, c.joinCode), { classroomName: next.name, joinApproval: next.joinApproval });
        await batch.commit();
        return loadClassroom(c.id);
      }),

    setArchived: (c, archived) =>
      wrap(async () => {
        const batch = writeBatch(db);
        batch.update(classroomRef(c.id), { status: archived ? 'archived' : 'active', updatedAt: serverTimestamp() });
        await batch.commit();
        return loadClassroom(c.id);
      }),

    regenerateJoinCode: (c) =>
      wrap(async () => {
        const owner = uid();
        for (let attempt = 0; attempt < 5; attempt++) {
          const joinCode = generateJoinCode();
          const batch = writeBatch(db);
          batch.update(classroomRef(c.id), { joinCode, updatedAt: serverTimestamp() });
          batch.set(doc(db, COL.joinCodes, joinCode), codeFields(owner, c));
          batch.delete(doc(db, COL.joinCodes, c.joinCode));
          try {
            await batch.commit();
            return await loadClassroom(c.id);
          } catch (e) {
            if ((e as { code?: string }).code !== 'permission-denied' || attempt === 4) throw e;
          }
        }
        throw new CloudError('code_collision', 'Could not allocate a unique join code. Please try again.');
      }),

    listRoster: (classroomId) =>
      wrap(async () => {
        const [members, players] = await Promise.all([
          getDocs(collection(db, COL.classrooms, classroomId, COL.members)),
          getDocs(collection(db, COL.classrooms, classroomId, COL.players)),
        ]);
        const byUid = new Map(players.docs.map((p) => [p.id, playerFromDoc(p.data())]));
        const roster: RosterEntry[] = members.docs.map((m) => {
          const member = memberFromDoc(m.data());
          return { ...member, player: byUid.get(member.uid) ?? null };
        });
        return roster.sort((a, b) => a.displayName.localeCompare(b.displayName));
      }),

    setMemberStatus: (classroomId, member: Member, status) =>
      wrap(async () => {
        const batch = writeBatch(db);
        batch.update(memberRef(classroomId, member.uid), { status, approvedAt: serverTimestamp(), approvedBy: uid() });
        if (status === 'active') {
          // Player documents are create-only; skip it when it already exists (e.g. a student who was removed, then re-approved).
          const existing = await getDoc(playerRef(classroomId, member.uid));
          if (!existing.exists()) batch.set(playerRef(classroomId, member.uid), { ...initialPlayerFields(member.uid, member.displayName), createdAt: serverTimestamp() });
        }
        await batch.commit();
      }),
  };

  const student: StudentService = {
    previewJoinCode: (rawCode) =>
      wrap(async () => {
        const code = normalizeJoinCode(rawCode);
        if (!code) throw new CloudError('invalid_code', 'Join codes have 8 letters and numbers, like K7QM-3XRD.');
        const snap = await getDoc(doc(db, COL.joinCodes, code));
        if (!snap.exists()) throw new CloudError('invalid_code', 'That code does not match a classroom. Check it with your teacher.');
        const d = snap.data();
        return { classroomId: d.classroomId as string, classroomName: d.classroomName as string, joinApproval: d.joinApproval as JoinPreview['joinApproval'] };
      }),

    requestJoin: (rawCode, displayName) =>
      wrap(async () => {
        const me = uid();
        const name = validateDisplayName(displayName);
        if (!name.ok) throw new CloudError('invalid_input', name.error);
        const code = normalizeJoinCode(rawCode);
        if (!code) throw new CloudError('invalid_code', 'Join codes have 8 letters and numbers, like K7QM-3XRD.');
        const preview = await student.previewJoinCode(code);

        const existing = await getDoc(memberRef(preview.classroomId, me)); // my own membership is readable
        if (existing.exists()) {
          const m = memberFromDoc(existing.data());
          return { classroomId: preview.classroomId, classroomName: preview.classroomName, status: m.status };
        }
        const status = preview.joinApproval === 'auto' ? 'active' : 'pending';
        const batch = writeBatch(db);
        batch.set(memberRef(preview.classroomId, me), { uid: me, displayName: name.value, status, joinCode: code, requestedAt: serverTimestamp() });
        batch.set(doc(db, COL.studentClassrooms, me, COL.classrooms, preview.classroomId), {
          classroomId: preview.classroomId,
          classroomName: preview.classroomName,
          joinedAt: serverTimestamp(),
        });
        if (status === 'active') batch.set(playerRef(preview.classroomId, me), { ...initialPlayerFields(me, name.value), createdAt: serverTimestamp() });
        try {
          await batch.commit();
        } catch (e) {
          if ((e as { code?: string }).code === 'permission-denied') {
            // Most likely the code was just regenerated, the classroom was archived, or the approval mode changed.
            throw new CloudError('invalid_code', 'This classroom is not accepting that code right now. Ask your teacher for the current code.');
          }
          throw e;
        }
        return { classroomId: preview.classroomId, classroomName: preview.classroomName, status };
      }),

    listMyClassrooms: () =>
      wrap(async () => {
        const me = uid();
        const links = await getDocs(collection(db, COL.studentClassrooms, me, COL.classrooms));
        const out: MyClassroom[] = [];
        for (const l of links.docs) {
          const m = await getDoc(memberRef(l.id, me));
          if (m.exists()) out.push({ classroomId: l.id, classroomName: l.data().classroomName as string, status: memberFromDoc(m.data()).status });
        }
        return out;
      }),

    getClassroom: (classroomId) =>
      wrap(async () => {
        try {
          return await loadClassroom(classroomId);
        } catch (e) {
          if ((e as { code?: string }).code === 'permission-denied') return null; // not approved yet
          throw e;
        }
      }),

    getMyPlayer: (classroomId) =>
      wrap(async () => {
        const snap = await getDoc(playerRef(classroomId, uid()));
        return snap.exists() ? playerFromDoc(snap.data()) : null;
      }),
  };

  // ---- trusted game service (Cloud Functions). The browser sends intents only; every number it gets back is the server's.
  const functions = getFunctions(app, 'us-central1');
  const call = async <T,>(name: string, data: object): Promise<T> => {
    const attempt = async () => (await httpsCallable(functions, name)(data)).data as T;
    try {
      return await attempt();
    } catch (e) {
      // Retrying with the SAME request id is safe: the server replays the first outcome instead of repeating it.
      const code = (e as { code?: string }).code;
      if (code === 'functions/unavailable' || code === 'functions/internal' || code === 'functions/deadline-exceeded') {
        try {
          return await attempt();
        } catch (e2) {
          throw toCloudError(e2);
        }
      }
      throw toCloudError(e);
    }
  };
  const requestId = (): string => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '-');
  const game: GameApi = {
    sync: (classroomId) => call(FUNCTION_NAMES.sync, { classroomId }),
    getDaily: (classroomId) => call(FUNCTION_NAMES.getDaily, { classroomId, requestId: requestId() }),
    submitDaily: (classroomId, index, answer) => call(FUNCTION_NAMES.submitDaily, { classroomId, requestId: requestId(), index, answer }),
    getBonus: (classroomId) => call(FUNCTION_NAMES.getBonus, { classroomId, requestId: requestId() }),
    submitBonus: (classroomId, index, choice) => call(FUNCTION_NAMES.submitBonus, { classroomId, requestId: requestId(), index, choice }),
    purchaseUpgrade: (classroomId, key, expectedLevel, claimedRemaining) =>
      call(FUNCTION_NAMES.upgrade, { classroomId, requestId: requestId(), key, expectedLevel, ...(claimedRemaining === undefined ? {} : { claimedRemaining }) }),
    donate: (classroomId, project, amount) => call(FUNCTION_NAMES.donate, { classroomId, requestId: requestId(), project, amount }),
  };

  const campaignRef = (cid: string) => doc(db, COL.classrooms, cid, COL.battle, 'campaign');
  const live = {
    watchCampaign: (cid: string, onData: (c: CampaignState | null) => void, onError: (e: Error) => void) =>
      onSnapshot(campaignRef(cid), (snap) => onData(snap.exists() ? (snap.data() as unknown as CampaignState) : null), (e) => onError(toCloudError(e))),
    watchMyPlayer: (cid: string, onData: (p: PlayerDoc | null) => void, onError: (e: Error) => void) =>
      onSnapshot(playerRef(cid, uid()), (snap) => onData(snap.exists() ? (snap.data() as unknown as PlayerDoc) : null), (e) => onError(toCloudError(e))),
  };

  // The test clock exists only against the emulators (the server also refuses it unless it is the emulator with an explicit opt-in).
  const devClock = cfg.useEmulator
    ? {
        set: async (ms: number) => ((await call<{ now: number }>(FUNCTION_NAMES.devClock, { action: 'set', ms })).now),
        advance: async (ms: number) => ((await call<{ now: number }>(FUNCTION_NAMES.devClock, { action: 'advance', ms })).now),
        reset: async () => ((await call<{ now: number }>(FUNCTION_NAMES.devClock, { action: 'reset' })).now),
      }
    : undefined;

  return { auth: authService, teacher, student, game, live, devClock };
}
