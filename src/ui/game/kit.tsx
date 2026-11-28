// The shared visual kit for the student experience: panels, headings, health/progress bars, currency, status pills and the HUD bar.
// Styling lives in src/theme.css (design tokens first, components after). Reuse these rather than adding one-off styles.
import type { ReactNode } from 'react';
import { fmtDps, fmtNum } from '../../game/format';
import { BoltIcon, BossIcon, CoinIcon, LogoMark } from './icons';

export type Accent = 'gold' | 'red' | 'blue' | 'green' | 'purple';

export function Panel({ title, icon, accent = 'gold', className = '', actions, children, id }: { title: string; icon?: ReactNode; accent?: Accent; className?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={`panel accent-${accent} ${className}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <SectionHeading id={id ? `${id}-h` : undefined} icon={icon} actions={actions}>{title}</SectionHeading>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function SectionHeading({ children, icon, actions, id }: { children: ReactNode; icon?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <header className="panel-head">
      <h2 id={id}>{icon}<span>{children}</span></h2>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>
  );
}

/** Boss and castle health. The number is always printed, so colour and fill are never the only signal. */
export function HealthBar({ kind, value, max, label }: { kind: 'boss' | 'castle'; value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`hbar hbar-${kind}`} role="progressbar" aria-label={kind === 'boss' ? 'Boss health' : 'Castle health'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={label}>
      <div className="hbar-fill" style={{ width: `${pct}%` }} />
      <span className="hbar-label">{label}</span>
    </div>
  );
}

export function ProgressBar({ value, max, label, tone = 'gold' }: { value: number; max: number; label: string; tone?: 'gold' | 'green' | 'blue' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`pbar pbar-${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={label}>
      <div className="pbar-fill" style={{ width: `${pct}%` }} />
      <span className="pbar-label">{label}</span>
    </div>
  );
}

export const Currency = ({ amount, size }: { amount: number; size?: number }) => (
  <span className="currency"><CoinIcon size={size} />{fmtNum(amount)}</span>
);

export const StatusPill = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) => <span className={`pill pill-${tone}`}>{children}</span>;

/** Top bar of the student home: logo, classroom, coins, DPS, boss number and a compact profile control. */
export function StudentHud({ classroomName, coins, dps, bossNumber, profile }: { classroomName: string; coins: number; dps: number; bossNumber: number | null; profile?: ReactNode }) {
  return (
    <header className="hud">
      <div className="hud-brand">
        <LogoMark />
        <div>
          <div className="hud-logo">Math Boss</div>
          <div className="hud-room" title={classroomName}>{classroomName}</div>
        </div>
      </div>
      <ul className="hud-stats" aria-label="Your stats">
        <li className="hud-chip" title="Your coins"><span className="sr-only">Coins </span><CoinIcon /><b>{fmtNum(coins)}</b></li>
        <li className="hud-chip" title="Your damage per second"><span className="sr-only">Your DPS </span><BoltIcon /><b>{fmtDps(dps)}</b><small>DPS</small></li>
        <li className="hud-chip" title="Current boss"><span className="sr-only">Current boss </span><BossIcon /><b>{bossNumber ?? '–'}</b><small>Boss</small></li>
      </ul>
      {profile && <div className="hud-profile">{profile}</div>}
    </header>
  );
}

/** Ref callback: focus an input without scrolling the page (autoFocus would jump past the battlefield on load). */
export const focusNoScroll = (el: HTMLInputElement | null): void => el?.focus({ preventScroll: true });
