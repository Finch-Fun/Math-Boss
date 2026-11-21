// Read-only summaries shared by the student view and the teacher Battle Report.
import { activatedCount, bossPct, castleMaxHp, classDps } from './core';
import { fmtPct } from './format';
import { fmtDuration } from './time';
import type { GameState } from './types';

export interface PhaseInfo {
  tone: 'combat' | 'waiting' | 'training' | 'breach' | 'idle';
  title: string;
  detail: string;
}

export function describePhase(s: GameState): PhaseInfo {
  const b = s.battle;
  switch (b.phase) {
    case 'combat':
      if (b.nextAttackAt === null) {
        return { tone: 'waiting', title: 'Waiting for the first student', detail: 'The boss starts attacking once a student answers a Daily Review question.' };
      }
      return { tone: 'combat', title: 'Combat', detail: `Next boss attack in ${fmtDuration(b.nextAttackAt - s.now)}` };
    case 'training':
      return { tone: 'training', title: 'Training period', detail: `Next boss in ${fmtDuration((b.trainingEndsAt ?? s.now) - s.now)}. All attacks are paused.` };
    case 'breach':
      return { tone: 'breach', title: 'Castle breached!', detail: `Repair the castle to 25% to resume combat (now ${fmtPct(b.castleHp / castleMaxHp(s))}).` };
    default:
      return { tone: 'idle', title: 'Campaign nearly over', detail: `Too late for another boss. A new campaign begins in ${fmtDuration(b.weekEnd - s.now)}.` };
  }
}

/** Time to defeat the current boss at the current class DPS, or null if not fighting. */
export function etaToDefeatMs(s: GameState): number | null {
  const b = s.battle;
  if (b.phase !== 'combat' || !b.boss) return null;
  const dps = classDps(s);
  return dps > 0 ? (b.boss.hp / dps) * 1000 : null;
}

export function topBy(s: GameState, field: 'weekDamage' | 'weekDonated', n = 3): { nickname: string; value: number }[] {
  return s.students
    .filter((st) => st[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, n)
    .map((st) => ({ nickname: st.nickname, value: st[field] }));
}

/** Changes since the start of the current day (the engine snapshots at local midnight). */
export function dailyChange(s: GameState): string[] {
  const snap = s.daySnapshot;
  const lines: string[] = [];
  const bossNumber = s.battle.boss?.number ?? 0;
  if (bossNumber !== snap.bossNumber) {
    lines.push(`A new boss appeared (Boss ${bossNumber})`);
  } else {
    const pts = Math.round((bossPct(s) - snap.bossPct) * 100);
    lines.push(`Boss damage ${pts >= 0 ? 'increased' : 'decreased'} by ${Math.abs(pts)} percentage points`);
  }
  const castlePts = Math.round((s.battle.castleHp / castleMaxHp(s) - snap.castlePct) * 100);
  lines.push(`Castle health ${castlePts >= 0 ? 'improved' : 'dropped'} by ${Math.abs(castlePts)} percentage points`);
  lines.push(`${s.stats.donated - snap.donated} coins donated`);
  lines.push(`${s.stats.questions - snap.questions} math questions completed`);
  return lines;
}

export function classSummary(s: GameState) {
  const n = s.students.length;
  return {
    activated: activatedCount(s),
    total: n,
    classDps: classDps(s),
    castlePct: s.battle.castleHp / castleMaxHp(s),
    bossPct: bossPct(s),
  };
}
