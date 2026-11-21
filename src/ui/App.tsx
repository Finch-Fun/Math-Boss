import { useMemo, useState } from 'react';
import { LocalStorageRepository } from '../storage/repository';
import DevPanel from './DevPanel';
import StudentView from './StudentView';
import TeacherView, { BattleReportBody } from './TeacherView';
import { useGame } from './useGame';

type View = 'student' | 'teacher' | 'dev';

export default function App() {
  const repo = useMemo(() => new LocalStorageRepository(), []);
  const game = useGame(repo);
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
    <div className="app">
      <header>
        <h1>⚔️ Math Boss</h1>
        <span className="badge">Prototype · local data only</span>
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
