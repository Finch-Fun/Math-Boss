import { useCallback, useEffect, useState } from 'react';
import type { Classroom, Cloud, CloudUser, MyClassroom, PlayerRecord } from '../../cloud/types';
import { practiceStorageKey } from '../../cloud/mode';
import { Card } from '../components';
import GameWorkspace from '../GameWorkspace';
import { useAction } from './useAsync';

export default function StudentFlow({ cloud, user }: { cloud: Cloud; user: CloudUser | null }) {
  const { busy, error, run } = useAction();
  const [mine, setMine] = useState<MyClassroom[] | null>(null);
  const [open, setOpen] = useState<MyClassroom | null>(null);
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');

  const uid = user?.uid;
  const refresh = useCallback(() => run(async () => setMine(await cloud.student.listMyClassrooms())), [cloud, run]);
  useEffect(() => {
    if (uid) refresh();
    else setMine(null);
  }, [uid, refresh]);

  const join = () =>
    run(async () => {
      // The student identity is created the first time it is needed, then restored automatically on later visits.
      if (!user) await cloud.auth.signInAnonymously();
      const joined = await cloud.student.requestJoin(code, nickname);
      setMine(await cloud.student.listMyClassrooms());
      setOpen(joined);
    });

  if (open && user) {
    return <ClassroomHome cloud={cloud} user={user} entry={open} onBack={() => { setOpen(null); refresh(); }} />;
  }

  return (
    <div className="stack">
      {mine && mine.length > 0 && (
        <Card title="My classrooms">
          <ul className="list">
            {mine.map((m) => (
              <li key={m.classroomId}>
                <span><strong>{m.classroomName}</strong> <span className={`tag ${m.status}`}>{m.status === 'pending' ? 'waiting for teacher' : m.status}</span></span>
                <button onClick={() => setOpen(m)}>Open</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={mine && mine.length ? 'Join another classroom' : 'Join your classroom'}>
        <label className="field">
          Classroom code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="off" />
        </label>
        <label className="field">
          Your nickname
          <input value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} placeholder="Not your full name" autoComplete="off" />
        </label>
        <p className="muted small">Use a nickname your teacher will recognize. We do not ask for your full name, email, or birthday.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !code.trim() || !nickname.trim()} onClick={join}>Join</button>
      </Card>
      {!user && (
        <Card title="Already joined before?">
          <p className="muted small">If you linked a Google account to your student account, sign in to get your classroom back on this device.</p>
          <button disabled={busy} onClick={() => run(() => cloud.auth.signInWithGoogle())}>Sign in with Google</button>
        </Card>
      )}
      {user && <AccountCard cloud={cloud} user={user} />}
    </div>
  );
}

function ClassroomHome({ cloud, user, entry, onBack }: { cloud: Cloud; user: CloudUser; entry: MyClassroom; onBack: () => void }) {
  const { busy, error, run } = useAction();
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [status, setStatus] = useState(entry.status);

  const load = useCallback(
    () =>
      run(async () => {
        const mine = (await cloud.student.listMyClassrooms()).find((m) => m.classroomId === entry.classroomId);
        setStatus(mine?.status ?? entry.status);
        if (mine?.status === 'active') {
          setClassroom(await cloud.student.getClassroom(entry.classroomId));
          setPlayer(await cloud.student.getMyPlayer(entry.classroomId));
        }
      }),
    [cloud, entry, run],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (status !== 'active' || !classroom) {
    return (
      <Card title={entry.classroomName}>
        {status === 'pending' && <p>Your request was sent. Your teacher needs to approve it before you can enter the classroom.</p>}
        {status === 'removed' && <p>Your teacher removed this membership. Ask them if this is a mistake.</p>}
        {status === 'active' && <p className="muted">Loading your classroom…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button onClick={() => load()} disabled={busy}>Check again</button>
          <button onClick={onBack}>← Back</button>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title={classroom.name}>
        <div className="row wrap">
          <button onClick={onBack}>← Back</button>
          <span>Playing as <strong>{player?.nickname ?? '…'}</strong></span>
        </div>
        <p className="notice">
          Classroom membership is saved to your account. Coins, upgrades and the boss fight below are <strong>practice only</strong>: they run on this
          device and are not shared with your class yet.
        </p>
      </Card>
      <GameWorkspace
        embedded
        badge="Practice · not shared with class"
        storageKey={practiceStorageKey(user.uid, classroom.id)}
        settings={classroom.settings}
      />
    </div>
  );
}

function AccountCard({ cloud, user }: { cloud: Cloud; user: CloudUser }) {
  const { busy, error, run } = useAction();
  return (
    <Card title="Your account on this device">
      {user.isAnonymous ? (
        <>
          <p>
            You are signed in with a <strong>temporary device account</strong>. It is remembered in this browser, but if you clear browser data or switch
            devices you will lose it. Linking a Google account keeps it.
          </p>
          <div className="row">
            <button disabled={busy} onClick={() => run(() => cloud.auth.linkGoogleToStudent())}>Keep my account with Google</button>
            <button className="danger" disabled={busy} onClick={() => confirm('Sign out? Without a linked Google account you cannot get this identity back.') && run(() => cloud.auth.signOut())}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Signed in with Google{user.email ? ` (${user.email})` : ''}. You can sign in again from any device.</p>
          <button disabled={busy} onClick={() => run(() => cloud.auth.signOut())}>Sign out</button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Card>
  );
}
