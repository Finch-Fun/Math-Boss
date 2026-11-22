import { lazy, Suspense, useMemo, useState } from 'react';
import { viteEnv } from '../cloud/env';
import { DEMO_STORAGE_KEY, resolveMode } from '../cloud/mode';
import GameWorkspace from './GameWorkspace';

// The Firebase screens (and the Firebase SDK behind them) load only when someone chooses a Firebase flow.
const CloudApp = lazy(() => import('./cloud/CloudApp'));

type Screen = 'entry' | 'demo' | 'teacher' | 'student';

export default function App() {
  const mode = useMemo(() => resolveMode(viteEnv), []);
  const [screen, setScreen] = useState<Screen>(mode.available === 'firebase' ? 'entry' : 'demo');

  if (screen === 'demo') {
    return (
      <GameWorkspace
        storageKey={DEMO_STORAGE_KEY}
        badge={mode.available === 'firebase' ? 'Demo mode · local data only' : 'Demo mode · Firebase not configured'}
        headerExtra={
          mode.available === 'firebase' ? (
            <button onClick={() => setScreen('entry')}>← Back to sign in</button>
          ) : (
            <span className="muted small" title={`Missing: ${mode.missing.join(', ')}`}>
              Add Firebase settings (see docs/FIREBASE_SETUP.md) to enable classrooms.
            </span>
          )
        }
      />
    );
  }

  if (screen === 'entry') {
    return (
      <div className="app">
        <header>
          <h1>⚔️ Math Boss</h1>
          <span className="badge">Pilot</span>
        </header>
        <div className="entry-grid">
          <section className="card">
            <h2>I'm a teacher</h2>
            <p className="muted">Sign in with your Google account to create and manage classrooms.</p>
            <button className="primary" onClick={() => setScreen('teacher')}>Teacher sign in</button>
          </section>
          <section className="card">
            <h2>I'm a student</h2>
            <p className="muted">Enter the code from your teacher to join your classroom.</p>
            <button className="primary" onClick={() => setScreen('student')}>Join a classroom</button>
          </section>
          <section className="card">
            <h2>Try the demo</h2>
            <p className="muted">Play the simulated class on this device. No account, nothing is shared.</p>
            <button onClick={() => setScreen('demo')}>Open demo</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="app"><p className="muted">Loading…</p></div>}>
      <CloudApp role={screen} onBack={() => setScreen('entry')} onDemo={() => setScreen('demo')} />
    </Suspense>
  );
}
