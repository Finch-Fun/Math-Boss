import { useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '../game/types';
import { LocalStorageRepository } from '../storage/repository';
import DevPanel from './DevPanel';
import StudentView from './StudentView';
import TeacherView, { BattleReportBody } from './TeacherView';
import { useGame } from './useGame';

type View = 'student' | 'teacher' | 'dev';

interface WorkspaceProps {
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

/** The complete local prototype (Student, Teacher, Developer views). Gameplay here is simulated and local, never authoritative. */
export default function GameWorkspace({ storageKey, settings, embedded = false, badge = 'Prototype · local data only', headerExtra }: WorkspaceProps) {
  const repo = useMemo(() => new LocalStorageRepository(storageKey), [storageKey]);
  const game = useGame(repo, settings);
  const [view, setView] = useState<View>('student');
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

  const tabs: [View, string][] = [
    ['student', 'Student'],
    ['teacher', 'Teacher'],
    ['dev', 'Developer'],
  ];
  return (
    <div className={embedded ? 'workspace' : 'app'}>
      <header>
        {!embedded && <h1>⚔️ Math Boss</h1>}
        <span className="badge">{badge}</span>
        {headerExtra}
        <nav aria-label="Views">
          {tabs.map(([key, label]) => (
            <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {view === 'student' && <StudentView game={game} />}
        {view === 'teacher' && <TeacherView game={game} onPresent={() => setPresenting(true)} />}
        {view === 'dev' && <DevPanel game={game} />}
      </main>
    </div>
  );
}
