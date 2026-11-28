// Which visual state the battlefield is in. This only READS the server-settled campaign state (or the local demo state); it never
// decides combat, timing or damage. Pure and unit-tested.
import { fmtPct } from '../game/format';
import { fmtDuration } from '../game/time';
import type { Phase } from '../game/types';

export type BattleMode = 'fighting' | 'waiting' | 'preparation' | 'breach' | 'idle';

export interface ModeInput {
  phase: Phase;
  bossAlive: boolean;
  activeCount: number;
}

export function battleMode(v: ModeInput): BattleMode {
  if (v.phase === 'breach') return 'breach';
  if (v.phase === 'training') return 'preparation';
  if (v.phase === 'idle') return 'idle';
  if (!v.bossAlive) return 'preparation';
  return v.activeCount > 0 ? 'fighting' : 'waiting';
}

/** Only activated students attack, and only while the class is actually fighting. */
export const canAttack = (mode: BattleMode, spriteActive: boolean): boolean => mode === 'fighting' && spriteActive;
/** The boss visually strikes the castle only during real combat (the server's attack timer is running). */
export const bossStrikes = (mode: BattleMode, nextAttackAt: number | null): boolean => mode === 'fighting' && nextAttackAt !== null;

export type CastleLook = 'ok' | 'hurt' | 'breached';
export const castleLook = (mode: BattleMode, castlePct: number): CastleLook => (mode === 'breach' ? 'breached' : castlePct < 0.5 ? 'hurt' : 'ok');

export type BossVisual = 'alive' | 'defeating' | 'defeated';
/** The defeat animation plays only when the boss is seen going from alive to dead; arriving to an already-defeated boss shows it gone. */
export function nextBossVisual(prev: BossVisual | null, bossAlive: boolean | null): BossVisual {
  if (bossAlive === null) return 'defeated';
  if (bossAlive) return 'alive';
  return prev === 'alive' ? 'defeating' : 'defeated';
}

export interface Status {
  tone: 'combat' | 'waiting' | 'training' | 'breach' | 'idle';
  title: string;
  detail: string;
}
export interface StatusInput {
  mode: BattleMode;
  now: number;
  nextAttackAt: number | null;
  trainingEndsAt: number | null;
  weekEnd: number;
  castlePct: number;
  bossNumber: number | null;
}
/** Clear text for every state, so nothing important is communicated by animation alone. */
export function statusText(v: StatusInput): Status {
  switch (v.mode) {
    case 'fighting':
      return { tone: 'combat', title: 'Battle!', detail: v.nextAttackAt !== null ? `Next boss attack in ${fmtDuration(v.nextAttackAt - v.now)}` : 'The class is attacking the boss.' };
    case 'waiting':
      return { tone: 'waiting', title: 'Waiting for the first student', detail: 'The boss starts attacking once a student answers a Daily Review question.' };
    case 'preparation':
      return {
        tone: 'training',
        title: 'Preparation time',
        detail: `${v.bossNumber ? `Boss ${v.bossNumber} defeated. ` : ''}Attacks are paused. Next boss in ${fmtDuration((v.trainingEndsAt ?? v.now) - v.now)}.`,
      };
    case 'breach':
      return { tone: 'breach', title: 'Castle breached!', detail: `Repair the castle with Castle Projects. Attacks resume at 25% health (now ${fmtPct(v.castlePct)}).` };
    default:
      return { tone: 'idle', title: 'Campaign nearly over', detail: `Too late for another boss. A new campaign begins in ${fmtDuration(v.weekEnd - v.now)}.` };
  }
}
