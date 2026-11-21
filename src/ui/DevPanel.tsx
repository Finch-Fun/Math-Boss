import { HOUR, DAY } from '../game/constants';
import { castleMaxHp, getStudent } from '../game/core';
import { devActivateAll, devGrantCoins, devSetBossHpFraction, devSetBots, devSetCastleFraction, devSetDpsMultiplier, switchPlayer } from '../game/dev';
import { fmtGameTime } from '../game/time';
import type { Game } from './useGame';

const SPEEDS = [1, 60, 600, 3600];

export default function DevPanel({ game }: { game: Game }) {
  const s = game.state;
  const player = getStudent(s, s.playerId);
  const act = game.act;
  return (
    <div className="stack">
      <section className="card dev">
        <h2>Developer testing mode</h2>
        <p className="muted small">
          Game time: <strong>{fmtGameTime(s.now)}</strong> · Phase: <strong>{s.battle.phase}</strong> · Week {s.battle.weekIndex}. The game state is saved in this browser only.
        </p>

        <h3>Time</h3>
        <p className="muted small">Live speed (game seconds per real second):</p>
        <div className="row wrap">
          {SPEEDS.map((n) => (
            <button key={n} className={game.scale === n ? 'active' : ''} onClick={() => game.setScale(n)}>
              {n === 1 ? 'Real time' : `${n}×`}
            </button>
          ))}
        </div>
        <p className="muted small">Instant skip (runs every event in order):</p>
        <div className="row wrap">
          <button onClick={() => game.skip(HOUR)}>+1 hour</button>
          <button onClick={() => game.skip(6 * HOUR)}>+6 hours</button>
          <button onClick={() => game.skip(DAY)}>+1 day</button>
          <button onClick={() => game.skip(7 * DAY)}>+1 week</button>
        </div>

        <h3>Coins and upgrades ({player.nickname})</h3>
        <div className="row wrap">
          <button onClick={() => act((st) => devGrantCoins(st, st.playerId, 100))}>+100 coins</button>
          <button onClick={() => act((st) => devGrantCoins(st, st.playerId, 1000))}>+1,000 coins</button>
          <button onClick={() => act((st) => devGrantCoins(st, st.playerId, 100000))}>+100,000 coins</button>
        </div>

        <h3>Battle</h3>
        <div className="row wrap">
          <button onClick={() => act((st) => devActivateAll(st))}>Activate all students</button>
          <button onClick={() => act((st) => devSetBossHpFraction(st, 0.05))}>Boss to 5% HP</button>
          <button onClick={() => act((st) => devSetBossHpFraction(st, 0))}>Defeat boss now</button>
          <button onClick={() => act((st) => devSetCastleFraction(st, 0.1))}>Castle to 10%</button>
          <button onClick={() => act((st) => devSetCastleFraction(st, 0))}>Force castle breach</button>
          <button onClick={() => act((st) => devSetCastleFraction(st, 1))}>Heal castle fully</button>
        </div>
        <p className="muted small">
          Castle {Math.round(s.battle.castleHp)} / {castleMaxHp(s)} · Bosses defeated {s.battle.bossesDefeated}
        </p>

        <h3>Simulation</h3>
        <label className="check inline">
          <input type="checkbox" checked={s.dev.botsEnabled} onChange={(e) => act((st) => devSetBots(st, e.target.checked))} />
          Simulated classmates (24 students answer questions, upgrade and donate)
        </label>
        <div className="row wrap">
          <label>
            DPS multiplier
            <select value={s.dev.dpsMultiplier} onChange={(e) => act((st) => devSetDpsMultiplier(st, Number(e.target.value)))}>
              {[1, 5, 25, 100, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
          <label>
            Play as
            <select value={s.playerId} onChange={(e) => act((st) => switchPlayer(st, e.target.value))}>
              {s.students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.nickname}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3>Reset</h3>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('Reset the prototype and delete all saved progress in this browser?')) game.reset();
          }}
        >
          Reset everything
        </button>
      </section>
    </div>
  );
}
