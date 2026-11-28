// Small original UI icons (inline SVG, drawn with the same thick-outline, flat-colour style as the battlefield).
import type { ReactNode } from 'react';
const P = { stroke: '#1d2433', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const Svg = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className="mb-icon">{children}</svg>
);

export const CoinIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><circle cx={12} cy={12} r={9} fill="#f5b82e" {...P} /><circle cx={12} cy={12} r={5} fill="none" stroke="#b9791a" strokeWidth={1.8} /></Svg>
);
export const SwordIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M5 19 L16 8 L19 5 L19 9 L8 20 Z" fill="#dfe6f1" {...P} /><path d="M4 16 L8 20 M3 21 L6 18" fill="none" {...P} /></Svg>
);
export const BossIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><circle cx={12} cy={13} r={8} fill="#7ccf61" {...P} /><path d="M6 8 L5 3 L10 6 M18 8 L19 3 L14 6" fill="#f4efdc" {...P} /><circle cx={9} cy={12} r={1.4} fill="#1d2433" /><circle cx={15} cy={12} r={1.4} fill="#1d2433" /><path d="M8.5 16.5 L15.5 16.5" fill="none" {...P} /></Svg>
);
export const CastleIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M4 20 V8 H7 V10 H9 V8 H11 V10 H13 V8 H15 V10 H17 V8 H20 V20 Z" fill="#c4bfb2" {...P} /><path d="M10.5 20 V15 Q12 13 13.5 15 V20" fill="#5a3a22" {...P} /></Svg>
);
export const ScrollIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M6 4 H18 V18 Q18 20 16 20 H8 Q6 20 6 18 Z" fill="#fff4d6" {...P} /><path d="M9 9 H15 M9 13 H15" fill="none" {...P} /></Svg>
);
export const StarIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M12 3 L14.6 9 L21 9.6 L16.2 13.8 L17.7 20 L12 16.7 L6.3 20 L7.8 13.8 L3 9.6 L9.4 9 Z" fill="#ffd43b" {...P} /></Svg>
);
export const HammerIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M5 20 L13 12" fill="none" stroke="#8a5a2b" strokeWidth={3.4} strokeLinecap="round" /><path d="M10 5 L17 4 L20 8 L14 11 Z" fill="#aeb7c6" {...P} /></Svg>
);
export const BoltIcon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M13 3 L5 14 H11 L10 21 L19 9 H13 Z" fill="#ffd43b" {...P} /></Svg>
);
export const LogoMark = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M16 2 L28 6 V16 Q28 25 16 30 Q4 25 4 16 V6 Z" fill="#d6453d" stroke="#1d2433" strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M10 22 L21 9 M21 9 L23 7 L23 12 M9 24 L12 21" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
