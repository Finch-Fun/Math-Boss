// Placeholder boss art: one original ogre-like silhouette, FACING RIGHT (toward the castle), feet at (0,0), about 230 wide by 235 tall.
// Every weekly boss draws through the same interface: `BossArt({ number })`. To give future bosses their own sprite, add an entry to
// BOSS_ARTS (indexed by boss number) that renders a component with the same class names (.boss-body, .boss-arm) the animations use.
import type { ComponentType } from 'react';
import { INK } from './characters';

export interface BossArtProps { number: number }
interface Palette { skin: string; belly: string; horn: string; dark: string }

const PALETTES: Palette[] = [
  { skin: '#7ccf61', belly: '#c8ef9d', horn: '#f4efdc', dark: '#3f8f3a' },
  { skin: '#8da3b8', belly: '#d2dde8', horn: '#f4efdc', dark: '#566b80' },
  { skin: '#ec7357', belly: '#ffc2a0', horn: '#ffe9a8', dark: '#a8432e' },
  { skin: '#a5dcf2', belly: '#eefaff', horn: '#ffffff', dark: '#5a9bb8' },
  { skin: '#9a86e0', belly: '#d9d0ff', horn: '#f0e8ff', dark: '#5a47a8' },
  { skin: '#58bfae', belly: '#bff2e6', horn: '#e8fff9', dark: '#2f8478' },
  { skin: '#e9bf52', belly: '#fff0b8', horn: '#fff7dd', dark: '#a8801f' },
];
const O = { stroke: INK, strokeWidth: 3.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export function Ogre({ number }: BossArtProps) {
  const p = PALETTES[(Math.max(1, number) - 1) % PALETTES.length];
  return (
    <g {...O}>
      <g className="boss-body">
        <rect x={-52} y={-34} width={38} height={34} rx={10} fill={p.dark} />
        <rect x={12} y={-34} width={38} height={34} rx={10} fill={p.dark} />
        <ellipse cx={-4} cy={-98} rx={80} ry={72} fill={p.skin} />
        <ellipse cx={8} cy={-86} rx={46} ry={48} fill={p.belly} strokeWidth={0} />
        <path d="M-70 -128 q-26 18 -24 48 q10 8 24 -6 z" fill={p.skin} />
        <g className="boss-head">
          <circle cx={26} cy={-176} r={44} fill={p.skin} />
          <path d="M-2 -204 L-22 -246 L12 -214 Z" fill={p.horn} />
          <path d="M44 -214 L66 -250 L72 -206 Z" fill={p.horn} />
          <ellipse cx={42} cy={-182} rx={11} ry={12} fill="#fff" />
          <ellipse cx={12} cy={-184} rx={9} ry={11} fill="#fff" />
          <circle cx={46} cy={-181} r={5} fill={INK} stroke="none" />
          <circle cx={16} cy={-183} r={4.6} fill={INK} stroke="none" />
          <path d="M28 -204 L54 -194" fill="none" strokeWidth={5} />
          <path d="M-2 -204 L22 -194" fill="none" strokeWidth={5} />
          <path d="M6 -152 Q30 -140 58 -154 L52 -146 L46 -152 L40 -144 L34 -151 L28 -144 L22 -151 L14 -146 Z" fill="#fff" />
        </g>
        <g className="boss-arm">
          <rect x={50} y={-132} width={50} height={22} rx={11} fill={p.skin} />
          <rect x={86} y={-168} width={34} height={86} rx={14} fill="#8a5a2b" />
          <circle cx={96} cy={-150} r={3.2} fill="#c9a06a" stroke="none" />
          <circle cx={110} cy={-128} r={3.2} fill="#c9a06a" stroke="none" />
        </g>
      </g>
    </g>
  );
}

export const BOSS_ARTS: Record<number, ComponentType<BossArtProps>> = {};
export const bossArtFor = (number: number): ComponentType<BossArtProps> => BOSS_ARTS[number] ?? Ogre;
