// Presentational building blocks shared by the local demo and the multiplayer screens. They receive plain values and callbacks, and
// decide nothing about gameplay: costs, levels and results all come from the caller (which gets them from the rules or the server).
import { UPGRADE_DEFS, UPGRADE_KEYS, PROJECT_DEFS, PROJECT_KEYS } from '../../game/constants';
import { fmtNum } from '../../game/format';
import type { ProjectKey, UpgradeKey, Upgrades } from '../../game/types';
import { isMaxed, upgradeCost } from '../../game/upgrades';
import { CoinIcon } from './icons';
import { Currency, ProgressBar, StatusPill } from './kit';

export function DailyProgress({ done, unlocked, remaining, active, zeroWeek }: { done: number; unlocked: number; remaining: number; active: boolean; zeroWeek?: boolean }) {
  return (
    <div className="daily-progress">
      <div className="daily-top">
        <StatusPill tone={active ? 'good' : 'warn'}>{active ? 'In the battle' : 'Not in the battle yet'}</StatusPill>
        <span className="daily-rewards" title="Coins for a correct answer">
          <CoinIcon size={16} /> 1st try <b>10</b> · 2nd <b>5</b> · later <b>2</b>
        </span>
      </div>
      {!zeroWeek && (
        <>
          <ProgressBar value={done} max={Math.max(1, unlocked)} tone="green" label={`${done} of ${unlocked} done · ${remaining} left`} />
        </>
      )}
    </div>
  );
}

export interface UpgradeRow {
  key: UpgradeKey;
  level: number;
  cost: number;
  maxed: boolean;
  now: string;
  next: string | null;
}
export const upgradeRows = (u: Upgrades, statText: (key: UpgradeKey, u: Upgrades) => string): UpgradeRow[] =>
  UPGRADE_KEYS.map((key) => {
    const maxed = isMaxed(u, key);
    return { key, level: u[key], cost: upgradeCost(key, u[key]), maxed, now: statText(key, u), next: maxed ? null : statText(key, { ...u, [key]: u[key] + 1 }) };
  });

export function UpgradeGrid({ rows, coins, busy, onBuy }: { rows: UpgradeRow[]; coins: number; busy?: boolean; onBuy: (key: UpgradeKey) => void }) {
  return (
    <div className="card-grid">
      {rows.map((r) => (
        <div className="item" key={r.key}>
          <div className="item-title">
            <h3>{UPGRADE_DEFS[r.key].label}</h3>
            <span className="level">Lv {r.level}</span>
          </div>
          <p className="item-blurb">{UPGRADE_DEFS[r.key].blurb}</p>
          <p className="item-stat">{r.now}{r.next && <> <span aria-hidden="true">→</span> <strong>{r.next}</strong></>}</p>
          {r.maxed ? (
            <button className="btn" disabled>Maxed</button>
          ) : (
            <button className="btn btn-primary" disabled={busy || coins < r.cost} onClick={() => onBuy(r.key)}>
              Buy for <Currency amount={r.cost} size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export interface ProjectRow { key: ProjectKey; level: number; funded: number; cost: number; maxed: boolean }

export function ProjectGrid({ rows, amounts, coins, busy, onAmount, onDonate, onMax }: {
  rows: ProjectRow[];
  amounts: Record<string, string>;
  coins: number;
  busy?: boolean;
  onAmount: (key: ProjectKey, v: string) => void;
  onDonate: (key: ProjectKey) => void;
  onMax: (key: ProjectKey) => void;
}) {
  return (
    <div className="card-grid">
      {rows.map((r) => {
        const def = PROJECT_DEFS[r.key];
        return (
          <div className="item" key={r.key}>
            <div className="item-title">
              <h3>{def.label}</h3>
              <span className="level">×{r.level}</span>
            </div>
            <p className="item-blurb">{def.blurb}</p>
            {r.maxed ? (
              <StatusPill tone="good">Maxed for this week</StatusPill>
            ) : (
              <>
                <ProgressBar value={r.funded} max={r.cost} tone="blue" label={`${fmtNum(r.funded)} / ${fmtNum(r.cost)} coins`} />
                <div className="row donate-row">
                  <input aria-label={`Donation to ${def.label}`} inputMode="numeric" value={amounts[r.key] ?? '10'} onChange={(e) => onAmount(r.key, e.target.value)} />
                  <button className="btn btn-primary" disabled={busy} onClick={() => onDonate(r.key)}>Donate</button>
                  <button className="btn" disabled={busy || coins < 1} onClick={() => onMax(r.key)}>Max</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { PROJECT_KEYS };

export function JoinPrompt() {
  return (
    <p className="join-prompt" role="note">
      <span className="arrow" aria-hidden="true">↓</span>
      <span>Your character is waiting. Answer a Daily Review question correctly to join this week&apos;s battle. You stay in until Monday.</span>
    </p>
  );
}

export function BattleFacts({ defeated, eta, armor, bonus, bossHit }: { defeated: number; eta: string | null; armor: string; bonus: string; bossHit: string | null }) {
  return (
    <p className="muted small">
      Bosses defeated this week: <strong>{defeated}</strong>
      {eta !== null && <> · About {eta} to defeat at the current class DPS</>} · Armor {armor} · Class DPS bonus +{bonus}
      {bossHit !== null && <> · Boss hits for {bossHit} per hour</>}
    </p>
  );
}
