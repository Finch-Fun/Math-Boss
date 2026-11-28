// Battlefield geometry and the army display-density strategy. Pure: no React, no Firebase, no clock, no randomness.
//
// One logical coordinate system (a 1000 x 440 SVG viewBox) is used on every screen size, so positions never change with the screen:
// the boss is always on the LEFT, the castle and the student army on the RIGHT, and everything scales together.
import { CHARACTER_CLASSES, classForUid, hash32, variantForUid, type CharacterClass } from './classes';

export const VIEW = { width: 1000, height: 440, groundY: 352 } as const;

/** The boss faces RIGHT (toward the castle). Students' characters face LEFT (toward the boss). */
export const BOSS_FACING = 'right' as const;
export const CHARACTER_FACING = 'left' as const;

/** Boss footprint (center x, feet y). Its art spans about x 40..270. */
export const BOSS_BOX = { x: 150, footY: VIEW.groundY, left: 40, right: 270 } as const;
/** The castle footprint on the right. */
export const CASTLE_BOX = { left: 770, right: 1000, footY: VIEW.groundY } as const;
/** Warriors stand strictly between the boss and the castle. Rangers and mages stay at or near the castle. */
export const WARRIOR_ZONE = { left: BOSS_BOX.right + 20, right: 560 } as const;
export const NEAR_CASTLE_LEFT = 540;

export interface Slot { x: number; y: number }
const grid = (cols: number, rows: number[], x0: number, dx: number, stagger = 0): Slot[] => {
  const out: Slot[] = [];
  for (let c = 0; c < cols; c++) rows.forEach((y, r) => out.push({ x: x0 + c * dx + (r % 2) * stagger, y }));
  return out;
};
const rowsFrontToBack = (n: number, y0: number, dy: number) => Array.from({ length: n }, (_, i) => y0 - i * dy);

/** Warriors: center-left, nearest the boss first (melee range), front row first. */
export const WARRIOR_SLOTS: Slot[] = grid(7, rowsFrontToBack(4, VIEW.groundY, 15), WARRIOR_ZONE.left + 6, 34, 14);
/** Rangers: on the castle wall walkway (front tier), then the tier behind it, then the tower tops. */
export const RANGER_SLOTS: Slot[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ x: 806 + i * 26, y: 216 })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: 819 + i * 26, y: 204 })),
  { x: 790, y: 170 },
  { x: 962, y: 152 },
];
/** Mages: on the ground in front of the castle, hugging its wall first. */
export const MAGE_SLOTS: Slot[] = Array.from({ length: 18 }, (_, i) => ({
  x: 742 - Math.floor(i / 3) * 30 + (i % 3 === 1 ? 12 : 0),
  y: VIEW.groundY - (i % 3) * 15,
}));
/** Students who have not joined this week's battle wait idle in the foreground on the right (the staging area). */
export const STAGING_SLOTS: Slot[] = grid(7, [392, 410], 800, 30, 14);

export const SLOTS: Record<CharacterClass, Slot[]> = { warrior: WARRIOR_SLOTS, ranger: RANGER_SLOTS, mage: MAGE_SLOTS };

/** How many individual sprites are drawn, by the width of the battlefield on screen. */
export function maxSpritesForWidth(px: number): number {
  if (px >= 900) return 28;
  if (px >= 640) return 20;
  if (px >= 440) return 14;
  return 10;
}

export interface ArmyMember { uid: string; active: boolean }
export interface Sprite {
  id: string;
  cls: CharacterClass;
  variant: number;
  x: number;
  y: number;
  /** Joined this week's battle (activated). Only active sprites may ever attack. */
  active: boolean;
  isYou: boolean;
  /** Deterministic animation timing (seconds), so nothing is random per render. */
  t: { bob: number; bobDelay: number; atk: number; atkDelay: number; sway: number };
}
export interface Army {
  sprites: Sprite[];
  /** Real totals for the whole classroom (never reduced by the sprite limit). */
  totalActive: number;
  totalInactive: number;
  hiddenActive: number;
  hiddenInactive: number;
}

const unit = (uid: string, salt: string) => (hash32(`${salt}:${uid}`) % 1000) / 1000;

/** Largest-remainder pick of `k` members so the class mix of the chosen members matches the whole group's mix. */
export function pickProportional(members: ArmyMember[], k: number): ArmyMember[] {
  if (k >= members.length) return [...members];
  if (k <= 0) return [];
  const byClass = new Map<CharacterClass, ArmyMember[]>(CHARACTER_CLASSES.map((c) => [c, []]));
  for (const m of [...members].sort((a, b) => hash32(a.uid) - hash32(b.uid) || (a.uid < b.uid ? -1 : 1))) byClass.get(classForUid(m.uid))!.push(m);
  const want = CHARACTER_CLASSES.map((c) => {
    const n = byClass.get(c)!.length;
    return { c, n, base: Math.floor((k * n) / members.length), rem: (k * n) / members.length - Math.floor((k * n) / members.length) };
  });
  let left = k - want.reduce((s, w) => s + w.base, 0);
  for (const w of [...want].sort((a, b) => b.rem - a.rem || CHARACTER_CLASSES.indexOf(a.c) - CHARACTER_CLASSES.indexOf(b.c))) {
    if (left > 0 && w.base < w.n) {
      w.base += 1;
      left -= 1;
    }
  }
  return want.flatMap((w) => byClass.get(w.c)!.slice(0, w.base));
}

/**
 * Chooses which classmates get an individual sprite and where they stand.
 *  - Never more than `max` sprites. The current student's sprite is always among them.
 *  - The class mix of the drawn sprites follows the class mix of the whole group.
 *  - Real totals are returned separately: gameplay never depends on how many sprites are drawn.
 */
export function buildArmy(members: ArmyMember[], selfUid: string | null, max: number): Army {
  const self = selfUid ? members.find((m) => m.uid === selfUid) : undefined;
  const others = members.filter((m) => m !== self);
  const activeOthers = others.filter((m) => m.active);
  const inactiveOthers = others.filter((m) => !m.active);
  const quota = Math.max(0, max - (self ? 1 : 0));
  let kActive = activeOthers.length;
  let kInactive = inactiveOthers.length;
  if (kActive + kInactive > quota) {
    const total = kActive + kInactive;
    kActive = Math.min(kActive, Math.round((quota * kActive) / total));
    if (activeOthers.length > 0 && kActive === 0 && quota > 0) kActive = 1;
    kInactive = Math.min(inactiveOthers.length, quota - kActive);
  }
  const shownActive = pickProportional(activeOthers, kActive);
  const shownInactive = pickProportional(inactiveOthers, kInactive);

  const used = new Map<string, number>();
  const sprites: Sprite[] = [];
  let hiddenActive = activeOthers.length - shownActive.length;
  let hiddenInactive = inactiveOthers.length - shownInactive.length;
  const place = (m: ArmyMember, isYou: boolean) => {
    const cls = classForUid(m.uid);
    const list = m.active ? SLOTS[cls] : STAGING_SLOTS;
    const key = m.active ? cls : 'staging';
    const i = used.get(key) ?? 0;
    if (i >= list.length) {
      if (m.active) hiddenActive += 1;
      else hiddenInactive += 1;
      return;
    }
    used.set(key, i + 1);
    const slot = list[i];
    sprites.push({
      id: m.uid,
      cls,
      variant: variantForUid(m.uid),
      x: slot.x,
      y: slot.y,
      active: m.active,
      isYou,
      t: {
        bob: 2.4 + unit(m.uid, 'bob') * 1.2,
        bobDelay: -unit(m.uid, 'bd') * 3,
        atk: 1.5 + unit(m.uid, 'atk') * 1.4,
        atkDelay: -unit(m.uid, 'ad') * 3,
        sway: 9 + unit(m.uid, 'sw') * 5,
      },
    });
  };
  if (self) place(self, true); // first, so it takes the front-most slot of its class
  for (const m of shownActive) place(m, false);
  for (const m of shownInactive) place(m, false);

  // Draw far-to-near so nearer characters overlap farther ones; the current student is drawn last (on top).
  sprites.sort((a, b) => Number(a.isYou) - Number(b.isYou) || a.y - b.y || a.x - b.x);
  return {
    sprites,
    totalActive: members.filter((m) => m.active).length,
    totalInactive: members.filter((m) => !m.active).length,
    hiddenActive,
    hiddenInactive,
  };
}
