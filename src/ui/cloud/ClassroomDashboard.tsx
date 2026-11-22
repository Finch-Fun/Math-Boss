import { useCallback, useEffect, useState } from 'react';
import { ALL_SKILLS } from '../../game/questions';
import type { Classroom, Cloud, RosterEntry } from '../../cloud/types';
import { practiceStorageKey } from '../../cloud/mode';
import { GRADE_LEVELS, formatJoinCode, validateClassroomInput } from '../../cloud/validation';
import { Card } from '../components';
import GameWorkspace from '../GameWorkspace';
import { useAction } from './useAsync';

type Tab = 'roster' | 'settings' | 'preview';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  cloud: Cloud;
  classroom: Classroom;
  onUpdated: (c: Classroom) => void;
  onBack: () => void;
}

export default function ClassroomDashboard({ cloud, classroom, onUpdated, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('roster');
  return (
    <div className="stack">
      <Card>
        <div className="row wrap">
          <button onClick={onBack}>← My classrooms</button>
          <h2 style={{ margin: 0 }}>{classroom.name}</h2>
          <span className={`tag ${classroom.status}`}>{classroom.status}</span>
        </div>
        <nav className="subtabs" aria-label="Classroom sections">
          {(
            [
              ['roster', 'Roster & join code'],
              ['settings', 'Settings'],
              ['preview', 'Demo gameplay'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      </Card>
      {tab === 'roster' && <Roster cloud={cloud} classroom={classroom} onUpdated={onUpdated} />}
      {tab === 'settings' && <SettingsForm cloud={cloud} classroom={classroom} onUpdated={onUpdated} />}
      {tab === 'preview' && (
        <>
          <p className="notice">
            Demo gameplay uses a <strong>simulated</strong> class on this device, seeded with this classroom's settings. It is not connected to your
            students: shared combat, coins and upgrades are not live yet.
          </p>
          <GameWorkspace
            surface="teacher-preview"
            embedded
            badge="Simulated · not your students"
            storageKey={practiceStorageKey('teacher-preview', classroom.id)}
            settings={classroom.settings}
          />
        </>
      )}
    </div>
  );
}

function Roster({ cloud, classroom, onUpdated }: { cloud: Cloud; classroom: Classroom; onUpdated: (c: Classroom) => void }) {
  const { busy, error, run } = useAction();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const load = useCallback(() => run(async () => setRoster(await cloud.teacher.listRoster(classroom.id))), [cloud, classroom.id, run]);
  useEffect(() => {
    load();
  }, [load]);

  const pending = roster?.filter((r) => r.status === 'pending') ?? [];
  return (
    <>
      <Card title="Join code">
        <p>
          <span className="code-box" aria-label="Join code">{formatJoinCode(classroom.joinCode)}</span>
        </p>
        <p className="muted small">
          Students enter this code to ask to join. {classroom.joinApproval === 'teacher' ? 'You approve each student below.' : 'Students join immediately (auto-approve is on).'}
        </p>
        <button
          disabled={busy}
          onClick={() => {
            if (confirm('Create a new join code? The old code stops working for new students.')) run(async () => onUpdated(await cloud.teacher.regenerateJoinCode(classroom)));
          }}
        >
          New code
        </button>
      </Card>
      <Card title={`Students${roster ? ` (${roster.filter((r) => r.status === 'active').length} active)` : ''}`}>
        {pending.length > 0 && <p className="notice">{pending.length} student(s) waiting for approval.</p>}
        {roster && roster.length === 0 && <p className="muted">No one has asked to join yet.</p>}
        <ul className="list">
          {roster?.map((r) => (
            <li key={r.uid}>
              <span>
                <strong>{r.displayName}</strong> <span className={`tag ${r.status}`}>{r.status}</span>
                {r.player && <span className="muted small"> · {r.player.coins} coins (not live yet)</span>}
              </span>
              <span className="row">
                {r.status !== 'active' && (
                  <button className="primary" disabled={busy} onClick={() => run(async () => { await cloud.teacher.setMemberStatus(classroom.id, r, 'active'); await load(); })}>
                    {r.status === 'removed' ? 'Restore' : 'Approve'}
                  </button>
                )}
                {r.status !== 'removed' && (
                  <button disabled={busy} onClick={() => run(async () => { await cloud.teacher.setMemberStatus(classroom.id, r, 'removed'); await load(); })}>
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="row">
          <button onClick={() => load()} disabled={busy}>Refresh</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </Card>
    </>
  );
}

function SettingsForm({ cloud, classroom, onUpdated }: { cloud: Cloud; classroom: Classroom; onUpdated: (c: Classroom) => void }) {
  const { busy, error, setError, run } = useAction();
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(classroom.name);
  const [grade, setGrade] = useState<string>(classroom.gradeLevel);
  const [timezone, setTimezone] = useState(classroom.timezone);
  const [approval, setApproval] = useState(classroom.joinApproval);
  const [s, setS] = useState(classroom.settings);

  const save = () => {
    const checked = validateClassroomInput({ name, gradeLevel: grade, timezone, joinApproval: approval, settings: s });
    if (!checked.ok) return setError(checked.error);
    setSaved(false);
    run(async () => {
      onUpdated(await cloud.teacher.updateClassroom(classroom, checked.value));
      setSaved(true);
    });
  };

  return (
    <Card title="Classroom settings">
      <label className="field">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">
        Grade level
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADE_LEVELS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      <label className="field">Timezone<input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
      <label className="field">
        New students
        <select value={approval} onChange={(e) => setApproval(e.target.value as typeof approval)}>
          <option value="teacher">I approve each student (recommended)</option>
          <option value="auto">Anyone with the code joins immediately</option>
        </select>
      </label>
      <h3>Daily Review</h3>
      <label className="field">
        Question difficulty
        <select value={s.difficultyPreset} onChange={(e) => setS({ ...s, difficultyPreset: e.target.value as typeof s.difficultyPreset })}>
          <option value="foundations">Foundations</option>
          <option value="balanced">Balanced</option>
          <option value="challenge">Challenge</option>
        </select>
      </label>
      <div className="field">
        Questions per day
        <div className="days">
          {DAYS.map((d, i) => (
            <label key={d} className="small">
              {d}
              <input
                type="number"
                min={0}
                max={20}
                value={s.dailyQuestions[i]}
                onChange={(e) => setS({ ...s, dailyQuestions: s.dailyQuestions.map((n, j) => (j === i ? Number(e.target.value) : n)) })}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        Skills
        <div className="checks">
          {ALL_SKILLS.map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={s.skills.includes(k)}
                onChange={(e) => setS({ ...s, skills: e.target.checked ? [...s.skills, k] : s.skills.filter((x) => x !== k) })}
              />{' '}
              {k}
            </label>
          ))}
        </div>
      </div>
      <label><input type="checkbox" checked={s.bonusEnabled} onChange={(e) => setS({ ...s, bonusEnabled: e.target.checked })} /> Bonus Questions</label>
      <label className="field">
        Boss difficulty
        <select value={s.bossDifficulty} onChange={(e) => setS({ ...s, bossDifficulty: e.target.value as typeof s.bossDifficulty })}>
          <option value="easy">Easy</option>
          <option value="normal">Normal</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="ok">Saved.</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={save}>Save settings</button>
        <button
          disabled={busy}
          onClick={() => run(async () => onUpdated(await cloud.teacher.setArchived(classroom, classroom.status === 'active')))}
        >
          {classroom.status === 'active' ? 'Archive classroom' : 'Restore classroom'}
        </button>
      </div>
      <p className="muted small">Archived classrooms stop accepting new students. Nothing is deleted.</p>
    </Card>
  );
}
