import { Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { allowedViews, effectiveView, type Surface, type WorkspaceView } from '../cloud/access';
import type { Settings } from '../game/types';
import { LocalStorageRepository } from '../storage/repository';
import StudentView from './StudentView';
import TeacherView, { BattleReportBody } from './TeacherView';
import { useGame, type Game } from './useGame';

interface WorkspaceProps {
  /** Decides which views exist here (see src/cloud/access.ts). Students only ever get the Student view. */
  surface: Surface;
  /** Developer tools, supplied only by the local demo and only when the build includes them (see devTools.tsx). */
  devTools?: ComponentType<{ game: Game }> | null;
  /** localStorage key for this local game. Demo mode and each Firebase classroom's practice game use different keys. */
  storageKey: string;
  /** Seeds a brand-new local game with a classroom's settings. */
  settings?: Settings;
  /** Embedded inside a Firebase classroom screen: no outer title bar. */
  embedded?: boolean;
  badge?: string;
  /** Extra controls in the title bar (e.g. a back button). */
  headerExtra?: ReactNode;
}

/** The local prototype UI. Gameplay here is simulated and local, never authoritative, and no view in it can reach Firebase. */
export default function GameWorkspace({ surface, devTools = null, storageKey, settings, embedded = false, badge = 'Prototype · local data only', headerExtra }: WorkspaceProps) {
  const repo = useMemo(() => new LocalStorageRepository(storageKey), [storageKey]);
  const game = useGame(repo, settings);
  const allowed = allowedViews(surface, devTools !== null);
  const [requested, setView] = useState<WorkspaceView>('student');
  const view = effectiveView(requested, allowed); // state manipulation can never select a view this surface does not allow
  const DevTools = surface === 'demo' ? devTools : null;
  const [presenting, setPresenting] = useState(false);

  if (presenting) {
    return (
      <div className="presentation">
        <button className="close" onClick={() => setPresenting(false)}>
          Exit presentation
        </button>
        <h1>{game.state.className} — Battle Report</h1>
        <BattleReportBody s={game.state} large />
      </div>
    );
  }

  const labels: Record<WorkspaceView, string> = { student: 'Student', teacher: 'Teacher', dev: 'Developer (simulation)' };
  return (
    <div className={embedded ? 'workspace' : 'app'}>
      <header>
        {!embedded && <h1>⚔️ Math Boss</h1>}
        <span className="badge">{badge}</span>
        {headerExtra}
        {allowed.length > 1 && (
          <nav aria-label="Views">
            {allowed.map((key) => (
              <button key={key} data-view={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
                {labels[key]}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main>
        {view === 'student' && <StudentView game={game} />}
        {view === 'teacher' && <TeacherView game={game} onPresent={() => setPresenting(true)} />}
        {view === 'dev' && DevTools && (
          <Suspense fallback={<p className="muted">Loading developer tools…</p>}>
            <DevTools game={game} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
