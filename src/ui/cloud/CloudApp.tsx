import { useEffect, useState } from 'react';
import { viteEnv } from '../../cloud/env';
import { toCloudError } from '../../cloud/errors';
import type { Cloud, CloudUser } from '../../cloud/types';
import StudentFlow from './StudentFlow';
import TeacherFlow from './TeacherFlow';

interface Props {
  role: 'teacher' | 'student';
  onBack: () => void;
  onDemo: () => void;
}

/** Loads the Firebase SDK on demand, restores the saved session, and hands control to the teacher or student flow. */
export default function CloudApp({ role, onBack, onDemo }: Props) {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    import('../../cloud/firebaseCloud')
      .then(({ createCloud }) => {
        if (cancelled) return;
        const c = createCloud(viteEnv);
        setCloud(c);
        off = c.auth.onChange((u) => {
          setUser(u);
          setAuthReady(true);
        });
      })
      .catch((e) => !cancelled && setLoadError(toCloudError(e, 'Could not start Firebase.').message));
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>⚔️ Math Boss</h1>
        <span className="badge">{role === 'teacher' ? 'Teacher' : 'Student'} · Firebase</span>
        <nav>
          <button onClick={onBack}>← Back</button>
          <button onClick={onDemo}>Demo</button>
        </nav>
      </header>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {!loadError && (!cloud || !authReady) && <p className="muted">Connecting…</p>}
      {cloud && authReady && role === 'teacher' && <TeacherFlow cloud={cloud} user={user} />}
      {cloud && authReady && role === 'student' && <StudentFlow cloud={cloud} user={user} />}
    </div>
  );
}
