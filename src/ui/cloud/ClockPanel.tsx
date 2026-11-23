import { useState } from 'react';
import type { Cloud } from '../../cloud/types';
import { Card } from '../components';

const HOURS = 3_600_000;

/** Emulator test clock. Rendered only in development builds that are pointed at the emulators (the server refuses it anywhere else). */
export default function ClockPanel({ cloud, onChanged }: { cloud: Cloud; onChanged: () => void }) {
  const [msg, setMsg] = useState('');
  if (!import.meta.env.DEV || !cloud.devClock) return null;
  const clock = cloud.devClock;
  const run = async (fn: () => Promise<number>) => {
    try {
      setMsg(`Server test clock: ${new Date(await fn()).toLocaleString()}`);
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test clock unavailable. Start the emulators with: npm run emulators:dev');
    }
  };
  return (
    <Card title="Developer: emulator test clock">
      <p className="muted small">Moves the Functions emulator's authoritative clock for every classroom. Never available outside the emulator.</p>
      <div className="row wrap">
        {[1, 6, 24, 24 * 7].map((h) => (
          <button key={h} onClick={() => run(() => clock.advance(h * HOURS))}>+{h >= 24 ? `${h / 24}d` : `${h}h`}</button>
        ))}
        <button onClick={() => run(() => clock.reset())}>Back to real time</button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
    </Card>
  );
}
