import { useState } from 'react';
import { updateSettings } from '../game/actions';
import { PROJECT_DEFS, PROJECT_KEYS } from '../game/constants';
import { activate, activatedCount, armorPct, castleMaxHp, classDps, dpsBonus, log } from '../game/core';
import { fmtDps, fmtNum, fmtPct } from '../game/format';
import { currentProjectCost } from '../game/projects';
import { ALL_SKILLS, SKILL_LABELS } from '../game/questions';
import { dailyChange, describePhase, etaToDefeatMs, topBy } from '../game/report';
import { fmtDuration, fmtGameTime } from '../game/time';
import type { BossDifficulty, DifficultyPreset, SkillKey } from '../game/types';
import { Bar, Card, Stat } from './components';
import type { Game } from './useGame';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TeacherView({ game, onPresent }: { game: Game; onPresent: () => void }) {
  const s = game.state;
  const [overrideId, setOverrideId] = useState('');
  const set = (patch: Parameters<typeof updateSettings>[1]) => game.act((state) => updateSettings(state, patch));
  const inactive = s.students.filter((st) => !st.activated);
  const zeroWeek = s.settings.dailyQuestions.every((n) => n === 0);

  const toggleSkill = (skill: SkillKey) => {
    const has = s.settings.skills.includes(skill);
    const next = has ? s.settings.skills.filter((k) => k !== skill) : [...s.settings.skills, skill];
    if (next.length) set({ skills: next });
  };

  return (
    <div className="stack">
      <Card title="Teacher dashboard">
        <p className="muted small">{s.className} · {s.students.length} students · Week {s.battle.weekIndex}</p>
        <button className="primary" onClick={onPresent}>
          Present Battle Report
        </button>
      </Card>

      <ReportCard s={s} />

      <Card title="Classroom settings">
        <label className="check">
          <input
            type="checkbox"
            checked={s.settings.requireMathForUpgrades}
            onChange={(e) => set({ requireMathForUpgrades: e.target.checked })}
          />
          <span>
            <strong>Require Math for Upgrades</strong> — students must subtract to find their remaining coins before buying an upgrade.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.settings.bonusEnabled} onChange={(e) => set({ bonusEnabled: e.target.checked })} />
          <span>
            <strong>Bonus Questions</strong> available to students
          </span>
        </label>

        <h3>Daily Review questions (0–20 per day)</h3>
        <div className="days">
          {DAY_NAMES.map((name, i) => (
            <label key={name}>
              {name}
              <input
                type="number"
                min={0}
                max={20}
                value={s.settings.dailyQuestions[i]}
                onChange={(e) => {
                  const next = [...s.settings.dailyQuestions];
                  next[i] = Number(e.target.value);
                  set({ dailyQuestions: next });
                }}
              />
            </label>
          ))}
        </div>
        {zeroWeek && <p className="notice">Zero-question week: every student is activated automatically (excluded from competitive rankings).</p>}
        <p className="muted small">Changes apply immediately. Questions already unlocked this week stay available.</p>

        <div className="row wrap">
          <label>
            Question difficulty mix
            <select value={s.settings.difficultyPreset} onChange={(e) => set({ difficultyPreset: e.target.value as DifficultyPreset })}>
              <option value="foundations">Foundations (70/25/5)</option>
              <option value="balanced">Balanced (40/40/20)</option>
              <option value="challenge">Challenge (20/40/40)</option>
            </select>
          </label>
          <label>
            Boss difficulty (applies to the next boss)
            <select value={s.settings.bossDifficulty} onChange={(e) => set({ bossDifficulty: e.target.value as BossDifficulty })}>
              <option value="easy">Easy (0.75×)</option>
              <option value="normal">Normal (1.0×)</option>
              <option value="hard">Hard (1.3×)</option>
            </select>
          </label>
        </div>

        <h3>Skills in Daily Review</h3>
        <div className="row wrap">
          {ALL_SKILLS.map((skill) => (
            <label key={skill} className="check inline">
              <input type="checkbox" checked={s.settings.skills.includes(skill)} onChange={() => toggleSkill(skill)} />
              {SKILL_LABELS[skill]}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Shared projects">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Built this week</th>
              <th>Funding</th>
            </tr>
          </thead>
          <tbody>
            {PROJECT_KEYS.map((key) => (
              <tr key={key}>
                <td>{PROJECT_DEFS[key].label}</td>
                <td>×{s.projects[key].level}</td>
                <td>
                  {s.projects[key].funded} / {currentProjectCost(s, key)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Student progress this week">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Status</th>
              <th>Questions</th>
              <th>First-try</th>
              <th>Damage</th>
              <th>Donated</th>
            </tr>
          </thead>
          <tbody>
            {s.students.map((st) => (
              <tr key={st.id}>
                <td>{st.nickname}</td>
                <td>{st.activated ? 'Active' : 'Inactive'}</td>
                <td>{st.weekQuestions}</td>
                <td>{st.weekQuestions ? fmtPct(st.weekFirstTry / st.weekQuestions) : '–'}</td>
                <td>{fmtNum(st.weekDamage)}</td>
                <td>{st.weekDonated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">First-try accuracy is shown only to the teacher. It is never shown on the presentation screen.</p>
      </Card>

      <Card title="Teacher activation override">
        <p className="muted small">For unusual situations only. This activates a student for the rest of the week, is logged, and never changes permanent progress.</p>
        <div className="row">
          <select aria-label="Student to activate" value={overrideId} onChange={(e) => setOverrideId(e.target.value)}>
            <option value="">Choose an inactive student</option>
            {inactive.map((st) => (
              <option key={st.id} value={st.id}>
                {st.nickname}
              </option>
            ))}
          </select>
          <button
            disabled={!overrideId}
            onClick={() => {
              game.act((state) => {
                const st = state.students.find((x) => x.id === overrideId);
                if (st && activate(state, st)) log(state, `Teacher override: ${st.nickname} was activated.`);
              });
              setOverrideId('');
            }}
          >
            Activate
          </button>
        </div>
      </Card>
    </div>
  );
}

function ReportCard({ s }: { s: Parameters<typeof describePhase>[0] }) {
  return (
    <Card title="Battle Report">
      <BattleReportBody s={s} />
    </Card>
  );
}

/** Shared by the dashboard card and the full-screen presentation. Shows nicknames only, never accuracy. */
export function BattleReportBody({ s, large = false }: { s: Parameters<typeof describePhase>[0]; large?: boolean }) {
  const b = s.battle;
  const boss = b.boss;
  const phase = describePhase(s);
  const eta = etaToDefeatMs(s);
  const max = castleMaxHp(s);
  const heavy = topBy(s, 'weekDamage');
  const donors = topBy(s, 'weekDonated');
  return (
    <div className={large ? 'report large' : 'report'}>
      <div className={`phase tone-${phase.tone}`}>
        <strong>{phase.title}</strong> — {phase.detail}
      </div>
      <h3>
        Boss {boss?.number}: {boss?.name} · {Math.round((1 - (boss ? boss.hp / boss.maxHp : 1)) * 100)}% defeated
      </h3>
      {boss && <Bar kind="boss" value={boss.hp} max={boss.maxHp} label={`${fmtNum(boss.hp)} / ${fmtNum(boss.maxHp)} HP remaining`} />}
      <h3>Castle</h3>
      <Bar kind="castle" value={b.castleHp} max={max} label={`${fmtNum(b.castleHp)} / ${fmtNum(max)} HP`} />
      <div className="stats">
        <Stat label="Bosses defeated this week" value={b.bossesDefeated} />
        <Stat label="Class DPS" value={fmtDps(classDps(s))} />
        <Stat label="Students activated" value={`${activatedCount(s)} / ${s.students.length}`} />
        <Stat label="Coins donated" value={fmtNum(s.stats.donated)} />
        <Stat label="Questions completed" value={fmtNum(s.stats.questions)} />
        <Stat label="Castle breaches" value={s.stats.breaches} />
      </div>
      {eta !== null && <p className="muted">At the current class DPS, this boss falls in about {fmtDuration(eta)}.</p>}
      <p className="muted small">
        Armor {fmtPct(armorPct(s))} · Battle Banner +{fmtPct(dpsBonus(s))} · {fmtGameTime(s.now)}
      </p>
      <h3>Since the start of today</h3>
      <ul>
        {dailyChange(s).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="two-col">
        <div>
          <h3>Heavy Hitters</h3>
          <ol>{heavy.length ? heavy.map((h) => <li key={h.nickname}>{h.nickname} — {fmtNum(h.value)} damage</li>) : <li className="muted">No damage yet</li>}</ol>
        </div>
        <div>
          <h3>Top Defenders</h3>
          <ol>{donors.length ? donors.map((h) => <li key={h.nickname}>{h.nickname} — {fmtNum(h.value)} coins</li>) : <li className="muted">No donations yet</li>}</ol>
        </div>
      </div>
      {s.history.length > 0 && (
        <>
          <h3>Previous weeks</h3>
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Bosses defeated</th>
                <th>Castle at end</th>
                <th>Breaches</th>
              </tr>
            </thead>
            <tbody>
              {s.history.slice(0, 5).map((w) => (
                <tr key={w.weekIndex}>
                  <td>{w.weekIndex}</td>
                  <td>{w.bossesDefeated}</td>
                  <td>{fmtPct(w.castlePct)}</td>
                  <td>{w.breaches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
