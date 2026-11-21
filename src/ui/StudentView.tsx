import { useState } from 'react';
import { bonusKey, currentDailyQuestion, dailyRemaining, purchaseUpgrade, submitBonusAnswer, submitDailyAnswer } from '../game/actions';
import { PROJECT_DEFS, PROJECT_KEYS, UPGRADE_DEFS, UPGRADE_KEYS } from '../game/constants';
import { armorPct, castleMaxHp, dpsBonus, getStudent, studentDps, weeklyUnlocked } from '../game/core';
import { donate } from '../game/projects';
import { currentProjectCost, isProjectMaxed } from '../game/projects';
import { fmtDps, fmtNum, fmtPct } from '../game/format';
import { bonusQuestionsForWeek, hintFor, SKILL_LABELS } from '../game/questions';
import { describePhase, etaToDefeatMs } from '../game/report';
import { fmtDuration, fmtGameTime } from '../game/time';
import type { GameState, Student, UpgradeKey, Upgrades } from '../game/types';
import { characterStats, dps, isMaxed, upgradeCost } from '../game/upgrades';
import { Bar, Card, Stat } from './components';
import type { Game } from './useGame';

const BOSS_ICONS = ['👹', '🧌', '🐉', '🗿', '👻', '🦑', '⛈️'];

type Tab = 'daily' | 'bonus' | 'upgrades' | 'projects';

export default function StudentView({ game }: { game: Game }) {
  const s = game.state;
  const player = getStudent(s, s.playerId);
  const [tab, setTab] = useState<Tab>('daily');
  const tabs: [Tab, string][] = [
    ['daily', 'Daily Review'],
    ['bonus', 'Bonus Questions'],
    ['upgrades', 'Upgrades'],
    ['projects', 'Classroom Projects'],
  ];
  return (
    <div className="stack">
      <BattlePanel s={s} />
      <PlayerPanel s={s} player={player} />
      <nav className="subtabs" aria-label="Student sections">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'daily' && <DailyReview game={game} player={player} />}
      {tab === 'bonus' && <BonusQuestions game={game} player={player} />}
      {tab === 'upgrades' && <Upgrades game={game} player={player} />}
      {tab === 'projects' && <Projects game={game} player={player} />}
      <Card title="Recent events">
        <ul className="events">
          {s.log.slice(0, 6).map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="muted">{fmtGameTime(e.at)}</span> {e.text}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function BattlePanel({ s }: { s: GameState }) {
  const b = s.battle;
  const boss = b.boss;
  const phase = describePhase(s);
  const eta = etaToDefeatMs(s);
  const max = castleMaxHp(s);
  return (
    <Card className="battle">
      <div className={`phase tone-${phase.tone}`}>
        <strong>{phase.title}</strong> — {phase.detail}
      </div>
      <div className="battle-grid">
        <div>
          <div className="big-icon" aria-hidden="true">
            {BOSS_ICONS[((boss?.number ?? 1) - 1) % BOSS_ICONS.length]}
          </div>
          <h3>
            Boss {boss?.number}: {boss?.name}
          </h3>
          {boss && <Bar kind="boss" value={boss.hp} max={boss.maxHp} label={`${fmtNum(boss.hp)} / ${fmtNum(boss.maxHp)} HP`} />}
          <p className="muted small">
            Bosses defeated this week: <strong>{b.bossesDefeated}</strong>
            {eta !== null && <> · At the current class DPS: about {fmtDuration(eta)} to defeat</>}
          </p>
        </div>
        <div>
          <div className="big-icon" aria-hidden="true">
            🏰
          </div>
          <h3>Classroom Castle</h3>
          <Bar kind="castle" value={b.castleHp} max={max} label={`${fmtNum(b.castleHp)} / ${fmtNum(max)} HP`} />
          <p className="muted small">
            Armor {fmtPct(armorPct(s))} · Class DPS bonus +{fmtPct(dpsBonus(s))}
            {boss && <> · Boss hits for {fmtNum(Math.round(boss.attackPerHour * (1 - armorPct(s))))} per hour</>}
          </p>
        </div>
      </div>
    </Card>
  );
}

function PlayerPanel({ s, player }: { s: GameState; player: Student }) {
  const stats = characterStats(player.upgrades);
  return (
    <Card title={`${player.nickname} (you)`}>
      <div className="stats">
        <Stat label="Coins" value={`🪙 ${fmtNum(player.coins)}`} />
        <Stat label="Your DPS" value={fmtDps(dps(player.upgrades))} />
        <Stat label="Damage this week" value={fmtNum(player.weekDamage)} />
        <Stat label="Weekly status" value={player.activated ? 'Active ⚔️' : 'Inactive'} />
      </div>
      <p className="muted small">
        Damage {stats.damage} · {stats.attacksPerSecond.toFixed(2)} attacks/sec · {fmtPct(stats.critChance)} crit chance · {stats.critMultiplier.toFixed(1)}× crit damage
        {player.activated && <> · Contributing {fmtDps(studentDps(s, player))} DPS right now</>}
      </p>
      {!player.activated && (
        <p className="notice">Answer one Daily Review question correctly to join this week&apos;s battle. You stay active until Monday.</p>
      )}
      <p className="muted small">Game time: {fmtGameTime(s.now)}</p>
    </Card>
  );
}

function DailyReview({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const q = currentDailyQuestion(s, player);
  const unlocked = weeklyUnlocked(s);
  const remaining = dailyRemaining(s, player);
  const zeroWeek = s.settings.dailyQuestions.every((n) => n === 0);

  const submit = (raw: string) => {
    const wasActive = player.activated;
    const r = game.act((state) => submitDailyAnswer(state, player.id, raw));
    if (!r.ok) return setFeedback({ kind: 'info', text: r.reason });
    setInput('');
    if (r.correct) {
      const tries = r.attempts === 1 ? 'on your first try' : `after ${r.attempts} tries`;
      setFeedback({ kind: 'good', text: `Correct ${tries}! +${r.coins} coins.${wasActive ? '' : ' You are now active for this week’s battle!'}` });
    } else {
      setFeedback({ kind: 'bad', text: `Not quite. Hint: ${r.hint}` });
    }
  };

  if (zeroWeek) {
    return (
      <Card title="Daily Review">
        <p>No Daily Review questions are assigned this week, so every student is automatically active. 🎉</p>
      </Card>
    );
  }
  if (!q) {
    return (
      <Card title="Daily Review">
        <p>
          All caught up! You completed {player.weekQuestions} of {unlocked} unlocked questions. More unlock on their assigned day.
        </p>
        {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      </Card>
    );
  }
  const hint = hintFor(q, player.currentWrong);
  return (
    <Card title="Daily Review">
      <p className="muted small">
        Question {player.weekQuestions + 1} of {unlocked} unlocked this week · {remaining} left · {SKILL_LABELS[q.skill]} ({q.difficulty})
      </p>
      <p className="question">{q.prompt}</p>
      {q.type === 'choice' ? (
        <div className="choices">
          {q.choices!.map((c) => (
            <button key={c} onClick={() => submit(String(c))}>
              {c}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input aria-label="Your answer" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your answer" autoFocus />
          <button type="submit" className="primary">
            Submit
          </button>
        </form>
      )}
      {hint && <p className="hint">💡 {hint}</p>}
      {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      <p className="muted small">First try 10 coins · second try 5 · third or later 2. You must answer correctly to move on.</p>
    </Card>
  );
}

function BonusQuestions({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [selected, setSelected] = useState<Record<number, number>>({});
  if (!s.settings.bonusEnabled) {
    return (
      <Card title="Bonus Questions">
        <p>Bonus Questions are not available right now.</p>
      </Card>
    );
  }
  const questions = bonusQuestionsForWeek(s.battle.weekIndex);
  return (
    <Card title="Bonus Questions">
      <p className="muted small">One attempt each. Correct answers earn 20 coins. No hints, and answers lock when submitted.</p>
      {questions.map((q, i) => {
        const answered = player.bonusAnswers[bonusKey(s, i)];
        return (
          <div className="bonus" key={q.id}>
            <p className="question small-q">{q.prompt}</p>
            {q.choices.map((choice, ci) => (
              <label key={choice} className="radio">
                <input
                  type="radio"
                  name={`bonus-${i}`}
                  disabled={!!answered}
                  checked={answered ? answered.choice === ci : selected[i] === ci}
                  onChange={() => setSelected({ ...selected, [i]: ci })}
                />
                {choice}
              </label>
            ))}
            {answered ? (
              <p className={`feedback ${answered.correct ? 'good' : 'bad'}`}>
                {answered.correct ? 'Correct! +20 coins.' : `Not this time. The answer was ${q.choices[q.correct]}.`} {q.explanation}
              </p>
            ) : (
              <button disabled={selected[i] === undefined} onClick={() => game.act((state) => submitBonusAnswer(state, player.id, i, selected[i]))}>
                Submit (final)
              </button>
            )}
          </div>
        );
      })}
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

function Upgrades({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [pending, setPending] = useState<UpgradeKey | null>(null);
  const [message, setMessage] = useState('');
  const buy = (key: UpgradeKey) => {
    const r = game.act((state) => purchaseUpgrade(state, player.id, key));
    setMessage(r.ok ? `${UPGRADE_DEFS[key].label} upgraded!` : r.reason);
  };
  return (
    <Card title="Permanent Upgrades">
      <p className="muted small">Upgrades are permanent. They never reset when the week ends.</p>
      <div className="grid">
        {UPGRADE_KEYS.map((key) => {
          const def = UPGRADE_DEFS[key];
          const level = player.upgrades[key];
          const maxed = isMaxed(player.upgrades, key);
          const cost = upgradeCost(key, level);
          const next = statText(key, { ...player.upgrades, [key]: level + 1 });
          return (
            <div className="upgrade" key={key}>
              <h3>
                {def.label} <span className="muted">Lv {level}</span>
              </h3>
              <p className="muted small">{def.blurb}</p>
              <p>
                {statText(key, player.upgrades)}
                {!maxed && <> → <strong>{next}</strong></>}
              </p>
              {maxed ? (
                <button disabled>Maxed</button>
              ) : (
                <button
                  className="primary"
                  disabled={player.coins < cost}
                  onClick={() => (s.settings.requireMathForUpgrades ? setPending(key) : buy(key))}
                >
                  Buy for 🪙 {cost}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="feedback info">{message}</p>}
      {pending && (
        <MathGate
          game={game}
          player={player}
          upgrade={pending}
          onClose={(text) => {
            setPending(null);
            if (text) setMessage(text);
          }}
        />
      )}
    </Card>
  );
}

function MathGate({ game, player, upgrade, onClose }: { game: Game; player: Student; upgrade: UpgradeKey; onClose: (message?: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const cost = upgradeCost(upgrade, player.upgrades[upgrade]);
  const confirm = () => {
    const claimed = Number(value);
    if (value.trim() === '' || !Number.isInteger(claimed)) return setError('Enter a whole number.');
    const r = game.act((state) => purchaseUpgrade(state, player.id, upgrade, { claimedRemaining: claimed }));
    if (r.ok) onClose(`${UPGRADE_DEFS[upgrade].label} upgraded!`);
    else setError(r.hint ? `${r.reason} ${r.hint}` : r.reason);
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Check your math">
        <h3>Check your math</h3>
        <p>
          You have <strong>{player.coins}</strong> coins. {UPGRADE_DEFS[upgrade].label} costs <strong>{cost}</strong> coins.
        </p>
        <p>How many coins will you have left?</p>
        <input aria-label="Coins left" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        {error && <p className="feedback bad">{error}</p>}
        <div className="row">
          <button className="primary" onClick={confirm}>
            Complete purchase
          </button>
          <button onClick={() => onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Projects({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  return (
    <Card title="Classroom Projects">
      <p className="muted small">Donations are voluntary and shared by the whole class. Project upgrades reset every Monday.</p>
      <div className="grid">
        {PROJECT_KEYS.map((key) => {
          const def = PROJECT_DEFS[key];
          const cost = currentProjectCost(s, key);
          const p = s.projects[key];
          const maxed = isProjectMaxed(s, key);
          const remaining = cost - p.funded;
          const amount = amounts[key] ?? '10';
          return (
            <div className="upgrade" key={key}>
              <h3>
                {def.label} <span className="muted">×{p.level}</span>
              </h3>
              <p className="muted small">{def.blurb}</p>
              {maxed ? (
                <p>Maxed for this week</p>
              ) : (
                <>
                  <Bar kind="project" value={p.funded} max={cost} label={`${p.funded} / ${cost} coins`} />
                  <div className="row">
                    <input
                      aria-label={`Donation to ${def.label}`}
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })}
                    />
                    <button
                      className="primary"
                      onClick={() => {
                        const r = game.act((state) => donate(state, player.id, key, Number(amount)));
                        setMessage(r.ok ? `Donated ${r.charged} coins to ${def.label}${r.completed ? ' — project complete!' : '.'}` : r.reason);
                      }}
                    >
                      Donate
                    </button>
                    <button onClick={() => setAmounts({ ...amounts, [key]: String(Math.min(player.coins, remaining)) })}>Max</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="feedback info">{message}</p>}
    </Card>
  );
}
