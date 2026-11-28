import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PROJECT_DEFS, PROJECT_KEYS, UPGRADE_DEFS } from '../../game/constants';
import { armor, bannerBonus, campaignProjectCost, isCampaignProjectMaxed } from '../../game/campaign';
import { fmtNum, fmtPct } from '../../game/format';
import { fmtDuration, fmtGameTime } from '../../game/time';
import { SKILL_LABELS } from '../../game/questions';
import { characterStats, dps, upgradeCost } from '../../game/upgrades';
import type { UpgradeKey, Upgrades } from '../../game/types';
import { toCloudError } from '../../cloud/errors';
import type { PlayerView, PublicBonus, PublicQuestion } from '../../cloud/multiplayerTypes';
import type { Classroom, Cloud } from '../../cloud/types';
import Battlefield from '../../battlefield/Battlefield';
import { viewFromCampaign } from '../../battlefield/view';
import { etaToDefeat } from '../../cloud/liveState';
import { HammerIcon, ScrollIcon, StarIcon, SwordIcon } from '../game/icons';
import { Panel, StudentHud, focusNoScroll } from '../game/kit';
import { BattleFacts, DailyProgress, JoinPrompt, ProjectGrid, UpgradeGrid, upgradeRows } from '../game/panels';
import ClockPanel from './ClockPanel';
import { useMultiplayer, type Multiplayer } from './useMultiplayer';

type Feedback = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/**
 * The real cooperative game. Everything shown here comes from the trusted server: the boss and castle are shared by the whole
 * class, and coins, rewards, upgrades and donations are decided by Cloud Functions. This screen only sends intents.
 * The battlefield is a picture of that shared state; it never sends anything itself.
 */
export default function MultiplayerStudent({ cloud, classroom, onBack }: { cloud: Cloud; classroom: Classroom; onBack?: () => void }) {
  const mp = useMultiplayer(cloud, classroom, 'student');
  const c = mp.projection?.state ?? null;
  const me = mp.me;
  const view = useMemo(() => (c ? viewFromCampaign(c, mp.now, classroom.id, me ? { uid: me.uid, activated: me.activated } : null) : null), [c, mp.now, classroom.id, me?.uid, me?.activated]); // eslint-disable-line react-hooks/exhaustive-deps
  const boss = c?.boss ?? null;

  return (
    <div className="student-home">
      <StudentHud
        classroomName={classroom.name}
        coins={me?.coins ?? 0}
        dps={me ? dps(me.upgrades) : 0}
        bossNumber={boss?.number ?? null}
        profile={
          <>
            {me && <span className="chip-profile" title="You">{me.nickname}</span>}
            {onBack && <button onClick={onBack}>← Back</button>}
          </>
        }
      />
      {mp.error && <p className="error" role="alert">{mp.error}</p>}
      {!c && !mp.error && <p className="muted">Joining the battle…</p>}
      {view && <Battlefield view={view} />}
      {me && !me.activated && c && <JoinPrompt />}
      {c && me && (
        <div className="home-grid">
          <Daily cloud={cloud} classroom={classroom} mp={mp} />
          <UpgradesTab cloud={cloud} classroom={classroom} mp={mp} me={me} />
          <ProjectsTab cloud={cloud} classroom={classroom} mp={mp} me={me} />
          <Bonus cloud={cloud} classroom={classroom} mp={mp} />
          <Panel id="log" title="Battle info" icon={<ScrollIcon />} accent="green" className="area-events">
            <BattleFacts
              defeated={c.bossesDefeated}
              eta={etaToDefeat(c) !== null ? fmtDuration(etaToDefeat(c) as number) : null}
              armor={fmtPct(armor(c))}
              bonus={fmtPct(bannerBonus(c))}
              bossHit={boss ? fmtNum(Math.round(boss.attackPerHour * (1 - armor(c)))) : null}
            />
            <p className="muted small">Each fighter on the battlefield stands for a classmate. Your character has the YOU tag. Server-settled at {fmtGameTime(c.lastSettledAt)}.</p>
            <ul className="events">{c.log.slice(0, 6).map((e, i) => <li key={`${e.at}-${i}`}>{new Date(e.at).toLocaleString()} — {e.text}</li>)}</ul>
          </Panel>
        </div>
      )}
      <ClockPanel cloud={cloud} onChanged={mp.sync} />
    </div>
  );
}

function PlayerStatsLine({ me }: { me: PlayerView }) {
  const stats = characterStats(me.upgrades);
  return (
    <p className="muted small stats-line">
      Damage {stats.damage} · {stats.attacksPerSecond.toFixed(2)} attacks/sec · {fmtPct(stats.critChance)} crit chance · {stats.critMultiplier.toFixed(1)}× crit damage · This week: {fmtNum(me.weekDamage)} damage
    </p>
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

  const progress = <DailyProgress done={me.weekQuestions} unlocked={me.dailyUnlocked} remaining={me.dailyRemaining} active={me.activated} zeroWeek={zeroWeek} />;
  if (zeroWeek) return <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">{progress}<p>No Daily Review questions are assigned this week, so every student is automatically active. 🎉</p></Panel>;
  if (!q) return <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">{progress}<p className="muted">Loading your question…</p>{error && <p className="error">{error}</p>}</Panel>;
  if (!q.question) {
    return (
      <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">
        {progress}
        <p>All caught up! You completed {me.weekQuestions} of {me.dailyUnlocked} unlocked questions. More unlock on their assigned day.</p>
        {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      </Panel>
    );
  }
  const question = q.question;
  return (
    <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">
      {progress}
      <p className="muted small">Question {me.weekQuestions + 1} of {me.dailyUnlocked} unlocked · {SKILL_LABELS[question.skill]} ({question.difficulty})</p>
      <p className="question">{question.prompt}</p>
      {question.type === 'choice' ? (
        <div className="choices">{question.choices!.map((ch) => <button key={ch} disabled={busy} onClick={() => submit(String(ch))}>{ch}</button>)}</div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(input); }}>
          <input aria-label="Your answer" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your answer" ref={focusNoScroll} />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>Submit</button>
        </form>
      )}
      {hint && <p className="hint">💡 {hint}</p>}
      {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">You must answer correctly to move on.</p>
    </Panel>
  );
}

function Bonus({ cloud, classroom, mp }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer }) {
  const { busy, error, run } = useCall();
  const [data, setData] = useState<{ enabled: boolean; questions: PublicBonus[] } | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  // Collapsed by default and loaded on first open, so the home screen makes no extra server call for a feature that may be switched off.
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const r = await run(() => cloud.game.getBonus(classroom.id));
    if (r?.ok) setData({ enabled: r.enabled, questions: r.questions });
  }, [cloud, classroom.id, run]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  const toggle = <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>;
  const P = (children: ReactNode) => <Panel id="bonus" title="Bonus Questions" icon={<StarIcon />} accent="purple" className="area-bonus" actions={toggle}>{children}</Panel>;
  if (!open) return P(<p className="muted small">Optional extra questions for 20 coins each. One attempt per question.</p>);
  if (!data) return P(<><p className="muted">Loading…</p>{error && <p className="error">{error}</p>}</>);
  if (!data.enabled) return P(<p>Bonus Questions are not available right now.</p>);
  return (
    <Panel id="bonus" title="Bonus Questions" icon={<StarIcon />} accent="purple" className="area-bonus" actions={toggle}>
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
    </Panel>
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
    <Panel id="upgrades" title="Character Upgrades" icon={<SwordIcon />} accent="red" className="area-upgrades">
      <p className="muted small">Upgrades are permanent. They never reset when the week ends.</p>
      <UpgradeGrid rows={upgradeRows(me.upgrades, statText)} coins={me.coins} busy={busy} onBuy={(key) => (needMath ? setPending(key) : void buy(key))} />
      <PlayerStatsLine me={me} />
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
    </Panel>
  );
}

function ProjectsTab({ cloud, classroom, mp, me }: { cloud: Cloud; classroom: Classroom; mp: Multiplayer; me: PlayerView }) {
  const { busy, error, run } = useCall();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const c = mp.projection!.state;
  const rows = PROJECT_KEYS.map((key) => ({ key, level: c.projects[key].level, funded: c.projects[key].funded, cost: campaignProjectCost(c, key), maxed: isCampaignProjectMaxed(c, key) }));
  return (
    <Panel id="projects" title="Castle Projects" icon={<HammerIcon />} accent="blue" className="area-projects">
      <p className="muted small">Donations are voluntary and shared by the whole class. Project upgrades reset every Monday.</p>
      <ProjectGrid
        rows={rows}
        amounts={amounts}
        coins={me.coins}
        busy={busy}
        onAmount={(key, v) => setAmounts({ ...amounts, [key]: v })}
        onMax={(key) => {
          const r = rows.find((x) => x.key === key)!;
          setAmounts({ ...amounts, [key]: String(Math.max(1, Math.min(me.coins, r.cost - r.funded))) });
        }}
        onDonate={async (key) => {
          const n = Number(amounts[key] ?? '10');
          if (!Number.isInteger(n) || n < 1) return setMessage('Enter a whole number of coins (1 or more).');
          const r = await run(() => cloud.game.donate(classroom.id, key, n));
          if (!r) return;
          if (r.ok) { mp.apply(r); setMessage(`Donated ${r.charged} coins to ${PROJECT_DEFS[key].label}${r.completed ? ' — project complete!' : '.'}`); }
          else setMessage(r.reason);
        }}
      />
      {message && <p className="feedback info">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Panel>
  );
}
