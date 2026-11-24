import { castleMax, armor, bannerBonus, classDpsOf, type CampaignState } from '../../game/campaign';
import { PROJECT_DEFS, PROJECT_KEYS } from '../../game/constants';
import { campaignProjectCost } from '../../game/campaign';
import { fmtDps, fmtNum, fmtPct } from '../../game/format';
import { describePhase } from '../../game/report';
import { fmtDuration, fmtGameTime } from '../../game/time';
import type { Settings } from '../../game/types';
import { campaignAsGameState, etaToDefeat } from '../../cloud/liveState';
import { Bar, Card, Stat } from '../components';

const BOSS_ICONS = ['👹', '🧌', '🐉', '🗿', '👻', '🦑', '⛈️'];

/** The shared, server-settled battle. Identical for every student in the classroom and for the teacher's Battle Report. */
export function SharedBattle({ c, now, className, settings, ageMs }: { c: CampaignState; now: number; className: string; settings: Settings; ageMs: number }) {
  const gs = campaignAsGameState(c, now, className, settings);
  const phase = describePhase(gs);
  const eta = etaToDefeat(c);
  const max = castleMax(c);
  const boss = c.boss;
  return (
    <Card className="battle">
      <div className={`phase tone-${phase.tone}`}>
        <strong>{phase.title}</strong> — {phase.detail}
      </div>
      <div className="battle-grid">
        <div>
          <div className="big-icon" aria-hidden="true">{BOSS_ICONS[((boss?.number ?? 1) - 1) % BOSS_ICONS.length]}</div>
          <h3>Boss {boss?.number}: {boss?.name}</h3>
          {boss && <Bar kind="boss" value={boss.hp} max={boss.maxHp} label={`${fmtNum(boss.hp)} / ${fmtNum(boss.maxHp)} HP`} />}
          <p className="muted small">
            Bosses defeated this week: <strong>{c.bossesDefeated}</strong>
            {eta !== null && <> · About {fmtDuration(eta)} to defeat at the current class DPS</>}
          </p>
        </div>
        <div>
          <div className="big-icon" aria-hidden="true">🏰</div>
          <h3>Classroom Castle</h3>
          <Bar kind="castle" value={c.castleHp} max={max} label={`${fmtNum(c.castleHp)} / ${fmtNum(max)} HP`} />
          <p className="muted small">
            Armor {fmtPct(armor(c))} · Class DPS bonus +{fmtPct(bannerBonus(c))}
            {boss && <> · Boss hits for {fmtNum(Math.round(boss.attackPerHour * (1 - armor(c))))} per hour</>}
          </p>
        </div>
      </div>
      <p className="muted small">
        {c.activatedCount} of {c.studentCount} students active · class DPS {fmtDps(classDpsOf(c))} · {fmtNum(c.stats.donated)} coins donated this week · week {c.weekIndex}
      </p>
      <p className="muted small">
        Server-settled at {fmtGameTime(c.lastSettledAt)}. {ageMs > 5000 ? 'Between updates this screen estimates progress; the server’s numbers are final.' : ''}
      </p>
    </Card>
  );
}

export function SharedProjects({ c }: { c: CampaignState }) {
  return (
    <div className="grid">
      {PROJECT_KEYS.map((key) => {
        const p = c.projects[key];
        const cost = campaignProjectCost(c, key);
        return (
          <div className="upgrade" key={key}>
            <h3>{PROJECT_DEFS[key].label} <span className="muted">×{p.level}</span></h3>
            <Bar kind="project" value={p.funded} max={cost} label={`${p.funded} / ${cost} coins`} />
          </div>
        );
      })}
    </div>
  );
}

/** Teacher Battle Report: reads only the shared campaign (no per-student or academic data). */
export function SharedReport({ c, now, className, settings }: { c: CampaignState; now: number; className: string; settings: Settings }) {
  return (
    <div className="stack">
      <SharedBattle c={c} now={now} className={className} settings={settings} ageMs={now - c.lastSettledAt} />
      <Card title="Battle Report">
        <div className="stats">
          <Stat label="Bosses defeated this week" value={c.bossesDefeated} />
          <Stat label="Class DPS" value={fmtDps(classDpsOf(c))} />
          <Stat label="Students activated" value={`${c.activatedCount} / ${c.studentCount}`} />
          <Stat label="Coins donated" value={fmtNum(c.stats.donated)} />
          <Stat label="Questions completed" value={fmtNum(c.stats.questions)} />
          <Stat label="Castle breaches" value={c.stats.breaches} />
        </div>
        <h3>Shared projects</h3>
        <SharedProjects c={c} />
        {c.history.length > 0 && (
          <>
            <h3>Previous weeks</h3>
            <table>
              <thead><tr><th>Week</th><th>Bosses defeated</th><th>Castle at end</th><th>Breaches</th></tr></thead>
              <tbody>
                {c.history.slice(0, 5).map((w) => (
                  <tr key={w.weekIndex}><td>{w.weekIndex}</td><td>{w.bossesDefeated}</td><td>{fmtPct(w.castlePct)}</td><td>{w.breaches}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {c.skippedWeeks > 0 && <p className="muted small">{c.skippedWeeks} idle weeks were skipped while nobody used the classroom.</p>}
        <h3>Recent events</h3>
        <ul className="events">{c.log.slice(0, 8).map((e, i) => <li key={`${e.at}-${i}`}><span className="muted">{fmtGameTime(e.at)}</span> {e.text}</li>)}</ul>
        <p className="muted small">
          This report shows shared classroom progress only. It updates when a student or you open the classroom; there is no background job (see docs/MULTIPLAYER.md).
        </p>
      </Card>
    </div>
  );
}
