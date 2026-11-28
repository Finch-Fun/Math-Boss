import { useMemo, useState } from 'react';
import { bonusKey, currentDailyQuestion, dailyRemaining, purchaseUpgrade, submitBonusAnswer, submitDailyAnswer } from '../game/actions';
import { PROJECT_DEFS, PROJECT_KEYS, UPGRADE_DEFS } from '../game/constants';
import { armorPct, dpsBonus, getStudent, studentDps, weeklyUnlocked } from '../game/core';
import { donate } from '../game/projects';
import { currentProjectCost, isProjectMaxed } from '../game/projects';
import { fmtDps, fmtNum, fmtPct } from '../game/format';
import { bonusQuestionsForWeek, hintFor, SKILL_LABELS } from '../game/questions';
import { etaToDefeatMs } from '../game/report';
import { fmtDuration, fmtGameTime } from '../game/time';
import type { GameState, Student, UpgradeKey, Upgrades } from '../game/types';
import { characterStats, dps, upgradeCost } from '../game/upgrades';
import Battlefield from '../battlefield/Battlefield';
import { viewFromGameState } from '../battlefield/view';
import { HammerIcon, ScrollIcon, StarIcon, SwordIcon } from './game/icons';
import { Panel, StudentHud, focusNoScroll } from './game/kit';
import { BattleFacts, DailyProgress, JoinPrompt, ProjectGrid, UpgradeGrid, upgradeRows } from './game/panels';
import type { Game } from './useGame';

/** The local prototype student screen (demo mode and the teacher's simulated preview). Same layout as the multiplayer screen. */
export default function StudentView({ game }: { game: Game }) {
  const s = game.state;
  const player = getStudent(s, s.playerId);
  const view = useMemo(() => viewFromGameState(s), [s]);
  const eta = etaToDefeatMs(s);
  const boss = s.battle.boss;
  return (
    <div className="student-home">
      <StudentHud classroomName={s.className} coins={player.coins} dps={dps(player.upgrades)} bossNumber={boss?.number ?? null} profile={<span className="chip-profile" title="You">{player.nickname}</span>} />
      <Battlefield view={view} />
      {!player.activated && <JoinPrompt />}
      <div className="home-grid">
        <DailyReview game={game} player={player} />
        <Upgrades game={game} player={player} />
        <Projects game={game} player={player} />
        <BonusQuestions game={game} player={player} />
        <Panel id="log" title="Battle info" icon={<ScrollIcon />} accent="green" className="area-events">
          <BattleFacts
            defeated={s.battle.bossesDefeated}
            eta={eta !== null ? fmtDuration(eta) : null}
            armor={fmtPct(armorPct(s))}
            bonus={fmtPct(dpsBonus(s))}
            bossHit={boss ? fmtNum(Math.round(boss.attackPerHour * (1 - armorPct(s)))) : null}
          />
          <ul className="events">
            {s.log.slice(0, 6).map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="muted">{fmtGameTime(e.at)}</span> {e.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function PlayerStats({ s, player }: { s: GameState; player: Student }) {
  const stats = characterStats(player.upgrades);
  return (
    <p className="muted small stats-line">
      Damage {stats.damage} · {stats.attacksPerSecond.toFixed(2)} attacks/sec · {fmtPct(stats.critChance)} crit chance · {stats.critMultiplier.toFixed(1)}× crit damage · This week: {fmtNum(player.weekDamage)} damage
      {player.activated && <> · Contributing {fmtDps(studentDps(s, player))} DPS right now</>}
    </p>
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

  const progress = <DailyProgress done={player.weekQuestions} unlocked={unlocked} remaining={remaining} active={player.activated} zeroWeek={zeroWeek} />;
  if (zeroWeek) {
    return (
      <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">
        {progress}
        <p>No Daily Review questions are assigned this week, so every student is automatically active. 🎉</p>
      </Panel>
    );
  }
  if (!q) {
    return (
      <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">
        {progress}
        <p>
          All caught up! You completed {player.weekQuestions} of {unlocked} unlocked questions. More unlock on their assigned day.
        </p>
        {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      </Panel>
    );
  }
  const hint = hintFor(q, player.currentWrong);
  return (
    <Panel id="daily" title="Daily Review" icon={<ScrollIcon />} accent="gold" className="area-daily">
      {progress}
      <p className="muted small">
        Question {player.weekQuestions + 1} of {unlocked} unlocked this week · {SKILL_LABELS[q.skill]} ({q.difficulty})
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
          <input aria-label="Your answer" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your answer" ref={focusNoScroll} />
          <button type="submit" className="btn btn-primary">
            Submit
          </button>
        </form>
      )}
      {hint && <p className="hint">💡 {hint}</p>}
      {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      <p className="muted small">You must answer correctly to move on.</p>
    </Panel>
  );
}

function BonusQuestions({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const toggle = (
    <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Hide' : 'Show'}
    </button>
  );
  if (!s.settings.bonusEnabled) {
    return (
      <Panel id="bonus" title="Bonus Questions" icon={<StarIcon />} accent="purple" className="area-bonus">
        <p>Bonus Questions are not available right now.</p>
      </Panel>
    );
  }
  if (!open) {
    return (
      <Panel id="bonus" title="Bonus Questions" icon={<StarIcon />} accent="purple" className="area-bonus" actions={toggle}>
        <p className="muted small">Optional extra questions for 20 coins each. One attempt per question.</p>
      </Panel>
    );
  }
  const questions = bonusQuestionsForWeek(s.battle.weekIndex);
  return (
    <Panel id="bonus" title="Bonus Questions" icon={<StarIcon />} accent="purple" className="area-bonus" actions={toggle}>
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

function Upgrades({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [pending, setPending] = useState<UpgradeKey | null>(null);
  const [message, setMessage] = useState('');
  const buy = (key: UpgradeKey) => {
    const r = game.act((state) => purchaseUpgrade(state, player.id, key));
    setMessage(r.ok ? `${UPGRADE_DEFS[key].label} upgraded!` : r.reason);
  };
  return (
    <Panel id="upgrades" title="Character Upgrades" icon={<SwordIcon />} accent="red" className="area-upgrades">
      <p className="muted small">Upgrades are permanent. They never reset when the week ends.</p>
      <UpgradeGrid rows={upgradeRows(player.upgrades, statText)} coins={player.coins} onBuy={(key) => (s.settings.requireMathForUpgrades ? setPending(key) : buy(key))} />
      <PlayerStats s={s} player={player} />
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
    </Panel>
  );
}

function MathGate({ game, player, upgrade, onClose }: { game: Game; player: Student; upgrade: UpgradeKey; onClose: (message?: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const cost = upgradeCostOf(upgrade, player);
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
const upgradeCostOf = (key: UpgradeKey, p: Student): number => upgradeCost(key, p.upgrades[key]);

function Projects({ game, player }: { game: Game; player: Student }) {
  const s = game.state;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const rows = PROJECT_KEYS.map((key) => ({ key, level: s.projects[key].level, funded: s.projects[key].funded, cost: currentProjectCost(s, key), maxed: isProjectMaxed(s, key) }));
  return (
    <Panel id="projects" title="Castle Projects" icon={<HammerIcon />} accent="blue" className="area-projects">
      <p className="muted small">Donations are voluntary and shared by the whole class. Project upgrades reset every Monday.</p>
      <ProjectGrid
        rows={rows}
        amounts={amounts}
        coins={player.coins}
        onAmount={(key, v) => setAmounts({ ...amounts, [key]: v })}
        onDonate={(key) => {
          const r = game.act((state) => donate(state, player.id, key, Number(amounts[key] ?? '10')));
          setMessage(r.ok ? `Donated ${r.charged} coins to ${PROJECT_DEFS[key].label}${r.completed ? ' — project complete!' : '.'}` : r.reason);
        }}
        onMax={(key) => {
          const r = rows.find((x) => x.key === key)!;
          setAmounts({ ...amounts, [key]: String(Math.min(player.coins, r.cost - r.funded)) });
        }}
      />
      {message && <p className="feedback info">{message}</p>}
    </Panel>
  );
}
