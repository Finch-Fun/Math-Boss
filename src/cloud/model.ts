// Firestore document shapes and path helpers (pure, no SDK). docs/FIREBASE_SETUP.md describes the collections.
import type { Classroom, ClassroomInput, ClassroomStatus, JoinApproval, Member, MemberStatus, PlayerRecord } from './types';

export const COL = {
  teacherAllowlist: 'teacherAllowlist', // doc id = lowercase email. Managed in the Firebase console only; clients have no access.
  teacherProfiles: 'teacherProfiles', // doc id = uid
  classrooms: 'classrooms',
  joinCodes: 'joinCodes', // doc id = join code
  studentClassrooms: 'studentClassrooms', // studentClassrooms/{uid}/classrooms/{classroomId}
  members: 'members', // classrooms/{id}/members/{uid}
  players: 'players', // classrooms/{id}/players/{uid}
  battle: 'battle', // classrooms/{id}/battle/* reserved for the multiplayer milestone (server-written only)
} as const;

type Doc = Record<string, unknown>;
const ms = (v: unknown): number | null => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : null);

/** Fields of a classroom document, minus the server timestamps (the caller adds createdAt / updatedAt). */
export function classroomFields(ownerUid: string, input: ClassroomInput, joinCode: string, status: ClassroomStatus = 'active') {
  return {
    ownerUid,
    name: input.name,
    gradeLevel: input.gradeLevel,
    timezone: input.timezone,
    joinCode,
    joinApproval: input.joinApproval,
    status,
    settings: input.settings,
  };
}

export function classroomFromDoc(id: string, d: Doc): Classroom {
  return {
    id,
    ownerUid: d.ownerUid as string,
    name: d.name as string,
    gradeLevel: d.gradeLevel as Classroom['gradeLevel'],
    timezone: d.timezone as string,
    joinCode: d.joinCode as string,
    joinApproval: d.joinApproval as JoinApproval,
    status: d.status as ClassroomStatus,
    settings: d.settings as Classroom['settings'],
    createdAt: ms(d.createdAt),
    updatedAt: ms(d.updatedAt),
  };
}

export function memberFromDoc(d: Doc): Member {
  return { uid: d.uid as string, displayName: d.displayName as string, status: d.status as MemberStatus, requestedAt: ms(d.requestedAt) };
}

export const initialUpgrades = (): PlayerRecord['upgrades'] => ({ damage: 0, speed: 0, critChance: 0, critDamage: 0 });

/** The only player document a client may ever create: zero coins, zero upgrades. The rules enforce exactly this shape. */
export const initialPlayerFields = (uid: string, nickname: string) => ({
  uid,
  nickname,
  coins: 0,
  lifetimeCoins: 0,
  upgrades: initialUpgrades(),
});

export function playerFromDoc(d: Doc): PlayerRecord {
  return {
    uid: d.uid as string,
    nickname: d.nickname as string,
    coins: d.coins as number,
    lifetimeCoins: d.lifetimeCoins as number,
    upgrades: d.upgrades as PlayerRecord['upgrades'],
  };
}
