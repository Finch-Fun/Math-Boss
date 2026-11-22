import { useCallback, useEffect, useState } from 'react';
import type { Classroom, ClassroomInput, Cloud, CloudUser } from '../../cloud/types';
import { GRADE_LEVELS, validateClassroomInput } from '../../cloud/validation';
import { Card } from '../components';
import ClassroomDashboard from './ClassroomDashboard';
import { useAction } from './useAsync';

type Approval = 'checking' | 'approved' | 'not_approved';

export default function TeacherFlow({ cloud, user }: { cloud: Cloud; user: CloudUser | null }) {
  const { busy, error, run } = useAction();
  const [approval, setApproval] = useState<Approval>('checking');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<Classroom | null>(null);

  const uid = user?.uid;
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;
    setApproval('checking');
    cloud.teacher
      .ensureProfile(user)
      .then(async (result) => {
        if (cancelled) return;
        setApproval(result);
        if (result === 'approved') setClassrooms(await cloud.teacher.listClassrooms());
      })
      .catch(() => !cancelled && setApproval('not_approved'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, uid]);

  const refresh = useCallback(() => run(async () => setClassrooms(await cloud.teacher.listClassrooms())), [cloud, run]);

  if (!user) {
    return (
      <Card title="Teacher sign in">
        <p>Sign in with the Google account your school registered for Math Boss.</p>
        <button className="primary" disabled={busy} onClick={() => run(() => cloud.auth.signInWithGoogle())}>
          Sign in with Google
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </Card>
    );
  }

  if (user.isAnonymous) {
    return (
      <Card title="This browser is signed in as a student">
        <p>
          To sign in as a teacher, sign out of the student session first. Without a linked Google account, that student identity cannot be
          recovered afterwards.
        </p>
        <button className="danger" onClick={() => run(() => cloud.auth.signOut())}>Sign out of the student session</button>
      </Card>
    );
  }

  if (approval === 'checking') return <p className="muted">Checking your teacher access…</p>;

  if (approval === 'not_approved') {
    return (
      <Card title="Teacher access not enabled">
        <p>
          {user.email ?? 'This account'} is not on the Math Boss teacher list (or its email is not verified). Ask the school administrator to add it,
          then sign in again.
        </p>
        <button onClick={() => run(() => cloud.auth.signOut())}>Sign out</button>
      </Card>
    );
  }

  if (selected) {
    return (
      <ClassroomDashboard
        cloud={cloud}
        classroom={selected}
        onUpdated={(c) => {
          setSelected(c);
          setClassrooms((list) => list.map((x) => (x.id === c.id ? c : x)));
        }}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="stack">
      <Card title="My classrooms">
        <p className="muted small">Signed in as {user.email}</p>
        {classrooms.length === 0 ? (
          <p className="muted">No classrooms yet. Create your first one below.</p>
        ) : (
          <ul className="list">
            {classrooms.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.name}</strong> · Grade {c.gradeLevel} <span className={`tag ${c.status}`}>{c.status}</span>
                </span>
                <button onClick={() => setSelected(c)}>Open</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button onClick={() => refresh()} disabled={busy}>Refresh</button>
          <button onClick={() => run(() => cloud.auth.signOut())}>Sign out</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </Card>
      <CreateClassroom
        busy={busy}
        onCreate={(input) =>
          run(async () => {
            const created = await cloud.teacher.createClassroom(input);
            setClassrooms((l) => [created, ...l]);
            setSelected(created);
          })
        }
      />
    </div>
  );
}

function CreateClassroom({ busy, onCreate }: { busy: boolean; onCreate: (input: ClassroomInput) => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('Mixed');
  const [error, setError] = useState('');
  return (
    <Card title="Create a classroom">
      <p className="muted small">Everything else starts with the game design defaults and can be changed later.</p>
      <label className="field">
        Classroom name
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Room 12 Math" />
      </label>
      <label className="field">
        Grade level
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADE_LEVELS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button
        className="primary"
        disabled={busy}
        onClick={() => {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const checked = validateClassroomInput({ name, gradeLevel: grade }, tz);
          if (!checked.ok) return setError(checked.error);
          setError('');
          onCreate(checked.value);
        }}
      >
        Create classroom
      </button>
    </Card>
  );
}

