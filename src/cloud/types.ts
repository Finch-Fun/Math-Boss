// Types and service interfaces for the Firebase classroom layer. No Firebase imports here: the UI and tests
// depend on these interfaces, and only src/cloud/firebaseCloud.ts talks to the SDK.
import type { CampaignState } from '../game/campaign';
import type { Settings } from '../game/types';
import type { GameApi, PlayerDoc } from './multiplayerTypes';

export type GradeLevel = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'Mixed';
export type JoinApproval = 'teacher' | 'auto';
export type ClassroomStatus = 'active' | 'archived';
export type MemberStatus = 'pending' | 'active' | 'removed';
/** Same shape as the game's Settings so a classroom's configuration can seed the rules engine later. */
export type ClassroomSettings = Settings;

export interface ClassroomInput {
  name: string;
  gradeLevel: GradeLevel;
  timezone: string;
  joinApproval: JoinApproval;
  settings: ClassroomSettings;
}

export interface Classroom extends ClassroomInput {
  id: string;
  ownerUid: string;
  joinCode: string;
  status: ClassroomStatus;
  createdAt: number | null; // ms; null until the server timestamp resolves
  updatedAt: number | null;
}

export interface Member {
  uid: string;
  displayName: string;
  status: MemberStatus;
  requestedAt: number | null;
}

/** Persistent progression owned by the server side. Clients can read their own and never write it (see firestore.rules). */
export interface PlayerRecord {
  uid: string;
  nickname: string;
  coins: number;
  lifetimeCoins: number;
  upgrades: { damage: number; speed: number; critChance: number; critDamage: number };
}

export interface RosterEntry extends Member {
  player: PlayerRecord | null;
}

export interface JoinPreview {
  classroomId: string;
  classroomName: string;
  joinApproval: JoinApproval;
}

export interface MyClassroom {
  classroomId: string;
  classroomName: string;
  status: MemberStatus;
}

export interface CloudUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
}

export interface AuthService {
  /** Fires once with the restored session (or null) and again on every change. */
  onChange(cb: (user: CloudUser | null) => void): () => void;
  /** Teachers (Google). Throws if the popup is closed or Google sign-in is not enabled. */
  signInWithGoogle(): Promise<CloudUser>;
  /** Students: a persistent but device-bound identity. See docs/FIREBASE_SETUP.md for the recovery limits. */
  signInAnonymously(): Promise<CloudUser>;
  /** Attaches a Google account to the current anonymous student so the same UID survives device changes. */
  linkGoogleToStudent(): Promise<CloudUser>;
  signOut(): Promise<void>;
}

export interface TeacherService {
  /** Writes the teacher profile; the Firestore rules refuse this unless the email is on the allowlist. */
  ensureProfile(user: CloudUser): Promise<'approved' | 'not_approved'>;
  createClassroom(input: ClassroomInput): Promise<Classroom>;
  listClassrooms(): Promise<Classroom[]>;
  updateClassroom(c: Classroom, patch: Partial<ClassroomInput>): Promise<Classroom>;
  setArchived(c: Classroom, archived: boolean): Promise<Classroom>;
  regenerateJoinCode(c: Classroom): Promise<Classroom>;
  listRoster(classroomId: string): Promise<RosterEntry[]>;
  setMemberStatus(classroomId: string, member: Member, status: 'active' | 'removed'): Promise<void>;
}

export interface StudentService {
  previewJoinCode(rawCode: string): Promise<JoinPreview>;
  requestJoin(rawCode: string, displayName: string): Promise<MyClassroom>;
  listMyClassrooms(): Promise<MyClassroom[]>;
  /** Readable only once the teacher has approved the membership. */
  getClassroom(classroomId: string): Promise<Classroom | null>;
  getMyPlayer(classroomId: string): Promise<PlayerRecord | null>;
}

/** Realtime views. Shared state has one listener per classroom; personal state is a separate, scoped listener. */
export interface LiveService {
  /** classrooms/{id}/battle/campaign: readable by the classroom's active members and its owning teacher. */
  watchCampaign(classroomId: string, onData: (c: CampaignState | null) => void, onError: (e: Error) => void): () => void;
  /** classrooms/{id}/players/{myUid}: only the student's own document. */
  watchMyPlayer(classroomId: string, onData: (p: PlayerDoc | null) => void, onError: (e: Error) => void): () => void;
}

/** Emulator-only controls for the injected test clock. Exists only when the app is pointed at the emulators. */
export interface DevClockControl {
  set(ms: number): Promise<number>;
  advance(ms: number): Promise<number>;
  reset(): Promise<number>;
}

export interface Cloud {
  auth: AuthService;
  teacher: TeacherService;
  student: StudentService;
  /** The trusted game service (Cloud Functions). Intents in, authoritative results out. */
  game: GameApi;
  live: LiveService;
  devClock?: DevClockControl;
}
