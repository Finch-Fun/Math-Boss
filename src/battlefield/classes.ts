// Cosmetic character classes. A class is DISPLAY ONLY: every class uses the same upgrade and DPS formulas (src/game/upgrades.ts).
// The assignment is a pure function of the student's persistent identity, so it never changes on refresh, sign-out or another device
// (as long as the same account is used) and needs no database field, no migration and no Math.random().
export type CharacterClass = 'warrior' | 'ranger' | 'mage';
export const CHARACTER_CLASSES: readonly CharacterClass[] = ['warrior', 'ranger', 'mage'];

/** FNV-1a, 32-bit. Stable across platforms and versions: changing it would reshuffle everyone's class. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const classForUid = (uid: string): CharacterClass => CHARACTER_CLASSES[hash32(`mb-class:${uid}`) % 3];

/** Which of four colour variants of the class art this identity wears (cosmetic only). */
export const variantForUid = (uid: string): number => (hash32(`mb-look:${uid}`) >>> 4) % 4;
