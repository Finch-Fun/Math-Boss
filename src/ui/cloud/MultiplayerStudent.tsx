import { useCallback, useEffect, useState } from 'react';
import { PROJECT_DEFS, PROJECT_KEYS, UPGRADE_DEFS, UPGRADE_KEYS } from '../../game/constants';
import { campaignProjectCost, isCampaignProjectMaxed } from '../../game/campaign';
import { fmtDps, fmtNum, fmtPct } from '../../game/format';
import { SKILL_LABELS } from '../../game/questions';
import { characterStats, dps, isMaxed, upgradeCost } from '../../game/upgrades';
import type { UpgradeKey, Upgrades } from '../../game/types';
import { toCloudError } from '../../cloud/errors';
import type { PlayerView, PublicBonus, PublicQuestion } from '../../cloud/multiplayerTypes';
import type { Classroom, Cloud } from '../../cloud/types';
import { Bar, Card, Stat } from '../components';
import ClockPanel from './ClockPanel';
import { SharedBattle } from './SharedBattle';
import { useMultiplayer, type Multiplayer } from './useMultiplayer';

type Tab = 'daily' | 'bonus' | 'upgrades' | 'projects';
type Feedback = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/**
 * The real cooperative game. Everything shown here comes from the trusted server: the boss and castle are shared by the whole
 * class, and coins, rewards, upgrades and donations are decided by Cloud Functions. This screen only sends intents.
 */
export default function MultiplayerStudent({ cloud, classroom }: { cloud: Cloud; classroom: Classroom }) {
  const mp = useMultiplayer(cloud, classroom, 'student');
  const [tab, setTab] = useState<Tab>('daily');
  const tabs: [Tab, string][] = [['daily', 'Daily Review'], ['bonus', 'Bonus Questions'], ['upgrades', 'Upgrades'], ['projects', 'Classroom Projects']];
  const c = mp.projection?.state ?? null;

  return (
    <div className="stack">
      <p className="notice">
        <strong>Multiplayer · shared with your class.</strong> The boss, castle, coins and upgrades are kept by the game server. Your classmates see the same boss you do.
      </p>
      {mp.error && <p className="error" role="alert">{mp.error}</p>}
      {!c && !mp.error && <p className="muted">Joining the battle…</p>}
      {c && <SharedBattle c={c} now={mp.now} className={classroom.name} settings={classroom.settings} ageMs={mp.projection?.ageMs ?? 0} />}
      {mp.me && c && <PlayerPanel me={mp.me} />}
      {c && mp.me && (
        <>
          <nav className="subtabs" aria-label="Student sections">
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          {tab === 'daily' && <Daily cloud={cloud} classroom={classroom} mp={mp} />}
          {tab === 'bonus' && <Bonus cloud={cloud} classroom={classroom} mp={mp} />}
          {tab === 'upgrades' && <UpgradesTab cloud={cloud} classroom={classroom} mp={mp} me={mp.me} />}
          {tab === 'projects' && <ProjectsTab cloud={cloud} classroom={classroom} mp={mp} me={mp.me} />}
          <Card title="Recent events">
            <ul className="events">{c.log.slice(0, 6).map((e, i) => <li key={`${e.at}-${i}`}>{new Date(e.at).toLocaleString()} — {e.text}</li>)}</ul>
          </Card>
        </>
      )}
      <ClockPanel cloud={cloud} onChanged={mp.sync} />
    </div>
  );
}

function PlayerPanel({ me }: { me: PlayerView }) {
  const stats = characterStats(me.upgrades);
  return (
    <Card title={`${me.nickname} (you)`}>
      <div className="stats">
        <Stat label="Coins" value={`🪙 ${fmtNum(me.coins)}`} />
        <Stat label="Your DPS" value={fmtDps(dps(me.upgrades))} />
        <Stat label="Damage this week" value={fmtNum(me.weekDamage)} />
        <Stat label="Weekly status" value={me.activated ? 'Active ⚔️' : 'Inactive'} />
      </div>
      <p className="muted small">
        Damage {stats.damage} · {stats.attacksPerSecond.toFixed(2)} attacks/sec · {fmtPct(stats.critChance)} crit chance · {stats.critMultiplier.toFixed(1)}× crit damage
      </p>
      {!me.activated && <p className="notice">Answer one Daily Review question correctly to join this week&apos;s battle. You stay active until Monday.</p>}
    </Card>
  );
}

/** Runs one server call at a time and shows a friendly error. */
function useCall() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(toCloudError(e).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

function Daily({ cloud, classroom, mp }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer }) {
  const { busy, error, run } = useCall();
  const [q, setQ] = useState<{ question: PublicQuestion | null; index: number } | null>(null);
  const [input, setInput] = useState('');
  const [hint, setHint] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const me = mp.me as PlayerView;
  const zeroWeek = classroom.settings.dailyQuestions.every((n) => n === 0);

  const load = useCallback(async () => {
    const r = await run(() => cloud.game.getDaily(classroom.id));
    if (r?.ok) {
      mp.apply(r);
      setQ({ question: r.question, index: r.index });
    }
  }, [cloud, classroom.id, run, mp.apply]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!zeroWeek) void load();
  }, [load, zeroWeek]);

  const submit = async (raw: string) => {
    if (!q) return;
    const r = await run(() => cloud.game.submitDaily(classroom.id, q.index, raw));
    if (!r) return;
    if (!r.ok) {
      setFeedback({ kind: 'info', text: r.reason });
      if (r.code === 'stale') void load();
      return;
    }
    mp.apply(r);
    setInput('');
    if (r.correct) {
      setHint('');
      setFeedback({ kind: 'good', text: `Correct${r.attempts === 1 ? ' on your first try' : ` after ${r.attempts} tries`}! +${r.coins} coins.` });
      void load();
    } else {
      setHint(r.hint);
      setFeedback({ kind: 'bad', text: 'Not quite. Try again with the hint.' });
    }
  };

  if (zeroWeek) return <Card title="Daily Review"><p>No Daily Review questions are assigned this week, so every student is automatically active. 🎉</p></Card>;
  if (!q) return <Card title="Daily Review"><p className="muted">Loading your question…</p>{error && <p className="error">{error}</p>}</Card>;
  if (!q.question) {
    return (
      <Card title="Daily Review">
        <p>All caught up! You completed {me.weekQuestions} of {me.dailyUnlocked} unlocked questions. More unlock on their assigned day.</p>
        {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      </Card>
    );
  }
  const question = q.question;
  return (
    <Card title="Daily Review">
      <p className="muted small">Question {me.weekQuestions + 1} of {me.dailyUnlocked} unlocked · {me.dailyRemaining} left · {SKILL_LABELS[question.skill]} ({question.difficulty})</p>
      <p className="question">{question.prompt}</p>
      {question.type === 'choice' ? (
        <div className="choices">{question.choices!.map((ch) => <button key={ch} disabled={busy} onClick={() => submit(String(ch))}>{ch}</button>)}</div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(input); }}>
          <input aria-label="Your answer" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your answer" autoFocus />
          <button type="submit" className="primary" disabled={busy || !input.trim()}>Submit</button>
        </form>
      )}
      {hint && <p className="hint">💡 {hint}</p>}
      {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">First try 10 coins · second try 5 · third or later 2. You must answer correctly to move on.</p>
    </Card>
  );
}

function Bonus({ cloud, classroom, mp }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer }) {
  const { busy, error, run } = useCall();
  const [data, setData] = useState<{ enabled: boolean; questions: PublicBonus[] } | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const load = useCallback(async () => {
    const r = await run(() => cloud.game.getBonus(classroom.id));
    if (r?.ok) setData({ enabled: r.enabled, questions: r.questions });
  }, [cloud, classroom.id, run]);
  useEffect(() => void load(), [load]);
  if (!data) return <Card title="Bonus Questions"><p className="muted">Loading…</p>{error && <p className="error">{error}</p>}</Card>;
  if (!data.enabled) return <Card title="Bonus Questions"><p>Bonus Questions are not available right now.</p></Card>;
  return (
    <Card title="Bonus Questions">
      <p className="muted small">One attempt each. Correct answers earn 20 coins. No hints, and answers lock when submitted.</p>
      {data.questions.map((q) => (
        <div className="bonus" key={q.index}>
          <p className="question small-q">{q.prompt}</p>
          {q.choices.map((choice, ci) => (
            <label key={choice} className="radio">
              <input type="radio" name={`bonus-${q.index}`} disabled={!!q.answered} checked={q.answered ? q.answered.choice === ci : selected[q.index] === ci} onChange={() => setSelected({ ...selected, [q.index]: ci })} />
              {choice}
            </label>
          ))}
          {q.answered ? (
            <p className={`feedback ${q.answered.correct ? 'good' : 'bad'}`}>{q.answered.correct ? 'Correct! +20 coins.' : `Not this time. The answer was ${q.choices[q.answered.correctChoice]}.`} {q.answered.explanation}</p>
          ) : (
            <button
              disabled={busy || selected[q.index] === undefined}
              onClick={async () => {
                const r = await run(() => cloud.game.submitBonus(classroom.id, q.index, selected[q.index]));
                if (r?.ok) mp.apply(r);
                void load();
              }}
            >
              Submit (final)
            </button>
          )}
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </Card>
  );
}

function statText(key: UpgradeKey, u: Upgrades): string {
  const c = characterStats(u);
  if (key === 'damage') return `${c.damage} damage`;
  if (key === 'speed') return `${c.attacksPerSecond.toFixed(2)} attacks/sec`;
  if (key === 'critChance') return `${fmtPct(c.critChance)} crit chance`;
  return `${c.critMultiplier.toFixed(1)}× crit damage`;
}

function UpgradesTab({ cloud, classroom, mp, me }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer; me: PlayerView }) {
  const { busy, error, run } = useCall();
  const [pending, setPending] = useState<UpgradeKey | null>(null);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const needMath = classroom.settings.requireMathForUpgrades;

  const buy = async (key: UpgradeKey, claimed?: number) => {
    const r = await run(() => cloud.game.purchaseUpgrade(classroom.id, key, me.upgrades[key], claimed));
    if (!r) return;
    if (r.ok) {
      mp.apply(r);
      setPending(null);
      setValue('');
      setMessage(`${UPGRADE_DEFS[key].label} upgraded!`);
    } else setMessage(r.hint ? `${r.reason} ${r.hint}` : r.reason);
  };
  return (
    <Card title="Permanent Upgrades">
      <p className="muted small">Upgrades are permanent. They never reset when the week ends.</p>
      <div className="grid">
        {UPGRADE_KEYS.map((key) => {
          const level = me.upgrades[key];
          const maxed = isMaxed(me.upgrades, key);
          const cost = upgradeCost(key, level);
          return (
            <div className="upgrade" key={key}>
              <h3>{UPGRADE_DEFS[key].label} <span className="muted">Lv {level}</span></h3>
              <p className="muted small">{UPGRADE_DEFS[key].blurb}</p>
              <p>{statText(key, me.upgrades)}{!maxed && <> → <strong>{statText(key, { ...me.upgrades, [key]: level + 1 })}</strong></>}</p>
              {maxed ? <button disabled>Maxed</button> : <button className="primary" disabled={busy || me.coins < cost} onClick={() => (needMath ? setPending(key) : void buy(key))}>Buy for 🪙 {cost}</button>}
            </div>
          );
        })}
      </div>
      {message && <p className="feedback info">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {pending && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label="Check your math">
            <h3>Check your math</h3>
            <p>You have <strong>{me.coins}</strong> coins. {UPGRADE_DEFS[pending].label} costs <strong>{upgradeCost(pending, me.upgrades[pending])}</strong> coins.</p>
            <p>How many coins will you have left?</p>
            <input aria-label="Coins left" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => (value.trim() !== '' && Number.isInteger(Number(value)) ? void buy(pending, Number(value)) : setMessage('Enter a whole number.'))}>Complete purchase</button>
              <button onClick={() => { setPending(null); setValue(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProjectsTab({ cloud, classroom, mp, me }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer; me: PlayerView }) {
  const { busy, error, run } = useCall();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const c = mp.projection!.state;
  return (
    <Card title="Classroom Projects">
      <p className="muted small">Donations are voluntary and shared by the whole class. Project upgrades reset every Monday.</p>
      <div className="grid">
        {PROJECT_KEYS.map((key) => {
          const cost = campaignProjectCost(c, key);
          const p = c.projects[key];
          const maxed = isCampaignProjectMaxed(c, key);
          const amount = amounts[key] ?? '10';
          return (
            <div className="upgrade" key={key}>
              <h3>{PROJECT_DEFS[key].label} <span className="muted">×{p.level}</span></h3>
              <p className="muted small">{PROJECT_DEFS[key].blurb}</p>
              {maxed ? <p>Maxed for this week</p> : (
                <>
                  <Bar kind="project" value={p.funded} max={cost} label={`${p.funded} / ${cost} coins`} />
                  <div className="row">
                    <input aria-label={`Donation to ${PROJECT_DEFS[key].label}`} inputMode="numeric" value={amount} onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })} />
                    <button className="primary" disabled={busy} onClick={async () => {
                      const n = Number(amount);
                      if (!Number.isInteger(n) || n < 1) return setMessage('Enter a whole number of coins (1 or more).');
                      const r = await run(() => cloud.game.donate(classroom.id, key, n));
                      if (!r) return;
                      if (r.ok) { mp.apply(r); setMessage(`Donated ${r.charged} coins to ${PROJECT_DEFS[key].label}${r.completed ? ' — project complete!' : '.'}`); }
                      else setMessage(r.reason);
                    }}>Donate</button>
                    <button onClick={() => setAmounts({ ...amounts, [key]: String(Math.max(1, Math.min(me.coins, cost - p.funded))) })}>Max</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="feedback info">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Card>
  );
}
