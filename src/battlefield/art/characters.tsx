// Placeholder character art: original, simple SVG shapes (flat colours, thick outlines). Each class is one small component that draws a
// character with its FEET at (0,0), FACING LEFT (toward the boss). To use finished sprites later, replace the components in
// CHARACTER_ART (same props) without touching the battlefield, layout or animation code.
import type { ComponentType } from 'react';
import type { CharacterClass } from '../classes';

export const INK = '#1d2433';
const SKIN = '#f2c9a0';
const WOOD = '#8a5a2b';
const OUTLINE = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export interface CharacterArtProps { variant: number }

const TUNIC = ['#3b6fd8', '#d6453d', '#2f9e6b', '#e0902b'];
const CLOAK = ['#2f9e44', '#0f8b8d', '#7c8f2a', '#a1672f'];
const ROBE = ['#6a5ae0', '#c14bb3', '#2f7fe0', '#d9534f'];

export function Warrior({ variant }: CharacterArtProps) {
  const c = TUNIC[variant % 4];
  return (
    <g {...OUTLINE}>
      <g className="bob">
        <g className="lunge">
          <rect x={-9} y={-15} width={7} height={15} rx={2} fill="#3a3f5a" />
          <rect x={2} y={-15} width={7} height={15} rx={2} fill="#3a3f5a" />
          <circle cx={11} cy={-27} r={9} fill="#e9edf5" />
          <circle cx={11} cy={-27} r={3.5} fill={c} />
          <path d="M-12 -16 L-10 -37 Q0 -42 10 -37 L12 -16 Z" fill={c} />
          <rect x={-12} y={-21} width={24} height={4.5} fill="#5a3a22" />
          <circle cx={-1} cy={-47} r={9} fill={SKIN} />
          <path d="M-10.5 -48 Q-1 -63 9 -48 Z" fill="#aeb7c6" />
          <path d="M-1 -59 q-5 -9 -13 -6" fill="none" stroke="#d6453d" strokeWidth={3.4} />
          <circle cx={-5.5} cy={-46.5} r={1.5} fill={INK} stroke="none" />
          <g className="swing">
            <rect x={-23} y={-36} width={13} height={5.5} rx={2.5} fill={SKIN} />
            <path d="M-21 -35 L-45 -55 L-41.5 -58.5 L-18 -38 Z" fill="#dfe6f1" />
            <path d="M-22 -31 L-15 -41" fill="none" strokeWidth={3.4} />
          </g>
        </g>
      </g>
    </g>
  );
}

export function Ranger({ variant }: CharacterArtProps) {
  const c = CLOAK[variant % 4];
  return (
    <g {...OUTLINE}>
      <g className="bob">
        <rect x={-8} y={-15} width={6.5} height={15} rx={2} fill="#4a3a2a" />
        <rect x={2} y={-15} width={6.5} height={15} rx={2} fill="#4a3a2a" />
        <rect x={7} y={-46} width={7} height={22} rx={2} fill={WOOD} transform="rotate(12 10 -35)" />
        <path d="M-12 -14 L-9 -38 Q0 -42 9 -38 L13 -14 Z" fill={c} />
        <rect x={-12} y={-21} width={25} height={4} fill="#5a3a22" />
        <circle cx={-1} cy={-47} r={8.5} fill={SKIN} />
        <path d="M-10.5 -46 Q-10 -63 2 -61 Q11 -57 9.5 -44 Q-1 -50 -10.5 -46 Z" fill={c} />
        <circle cx={-5.5} cy={-46} r={1.5} fill={INK} stroke="none" />
        <g className="bow">
          <rect x={-26} y={-44} width={18} height={5} rx={2.5} fill={SKIN} />
          <path d="M-27 -60 Q-43 -43 -27 -26" fill="none" stroke={WOOD} strokeWidth={3.6} />
          <path d="M-27 -60 L-27 -26" fill="none" stroke="#f4f1e8" strokeWidth={1.4} />
        </g>
      </g>
    </g>
  );
}

export function Mage({ variant }: CharacterArtProps) {
  const c = ROBE[variant % 4];
  return (
    <g {...OUTLINE}>
      <g className="bob">
        <path d="M-13 0 L-9 -36 Q0 -40 9 -36 L13 0 Z" fill={c} />
        <path d="M-13 0 L-12 -6 L12 -6 L13 0 Z" fill="#ffd43b" />
        <circle cx={-1} cy={-46} r={8.5} fill={SKIN} />
        <circle cx={-5.5} cy={-45.5} r={1.5} fill={INK} stroke="none" />
        <path d="M-1 -62 Q-7 -60 -12 -50 L12 -50 Q8 -60 -1 -62 Z" fill={c} />
        <path d="M-1 -80 L-10 -54 L8 -54 Z" fill={c} />
        <ellipse cx={-1} cy={-52} rx={15} ry={4.2} fill={c} />
        <g className="staff">
          <rect x={-31} y={-42} width={22} height={5} rx={2.5} fill={SKIN} />
          <line x1={-27} y1={-2} x2={-27} y2={-62} stroke={WOOD} strokeWidth={3.4} />
          <circle className="orb" cx={-27} cy={-66} r={6.5} fill="#9be7ff" />
        </g>
      </g>
    </g>
  );
}

export const CHARACTER_ART: Record<CharacterClass, ComponentType<CharacterArtProps>> = { warrior: Warrior, ranger: Ranger, mage: Mage };

/** Where a ranged attack leaves the character (relative to its feet), for projectile start positions. */
export const MUZZLE: Record<CharacterClass, { x: number; y: number }> = { warrior: { x: -44, y: -54 }, ranger: { x: -34, y: -43 }, mage: { x: -27, y: -66 } };
/** Height of the "YOU" tag above the feet. */
export const TAG_Y: Record<CharacterClass, number> = { warrior: -72, ranger: -70, mage: -92 };

export function Arrow() {
  return (
    <g {...OUTLINE} strokeWidth={2.2}>
      <path d="M0 0 L-24 0" fill="none" stroke={WOOD} />
      <path d="M-24 0 l7 -4.5 l0 9 z" fill="#dfe6f1" />
      <path d="M0 0 l5 -3 M0 0 l5 3" fill="none" stroke="#d6453d" />
    </g>
  );
}
export function Orb() {
  return (
    <g stroke={INK} strokeWidth={2}>
      <circle r={6} fill="#b79cff" />
      <circle r={2.6} cx={-1.5} cy={-1.5} fill="#f1e9ff" stroke="none" />
    </g>
  );
}
