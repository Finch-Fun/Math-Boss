import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { HOUR } from '../game/constants';
import { advance } from '../game/engine';
import { createGame } from '../game/sample';
import { weekStartOf } from '../game/time';
import type { GameState, Settings } from '../game/types';
import type { GameRepository } from '../storage/repository';

const MAX_OFFLINE_MS = 8 * 7 * 24 * HOUR;

// The prototype's game clock starts on Monday at 8:00 AM so the first session always begins on a school morning.
const createFresh = (settings?: Settings): GameState => createGame({ now: weekStartOf(Date.now()) + 8 * HOUR, settings });

function loadOrCreate(repo: GameRepository, settings?: Settings): GameState {
  const saved = repo.load();
  if (!saved) return createFresh(settings);
  // Offline progress: the battle keeps running while the browser is closed.
  const elapsed = Math.min(Math.max(0, Date.now() - saved.savedAtReal), MAX_OFFLINE_MS);
  advance(saved, saved.now + elapsed);
  saved.savedAtReal = Date.now();
  return saved;
}

export interface Game {
  state: GameState;
  scale: number;
  setScale: (n: number) => void;
  /** Syncs the clock, runs a mutation against the authoritative state, saves, and re-renders. */
  act: <T>(fn: (s: GameState) => T) => T;
  skip: (ms: number) => void;
  reset: () => void;
}

/** `settings` seeds a brand-new local game (e.g. from a Firebase classroom's configuration); a saved game keeps its own. */
export function useGame(repo: GameRepository, settings?: Settings): Game {
  const stateRef = useRef<GameState | null>(null);
  if (stateRef.current === null) stateRef.current = loadOrCreate(repo, settings);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [scale, setScaleState] = useState(1);
  const scaleRef = useRef(1);
  const lastReal = useRef(Date.now());

  const sync = useCallback(() => {
    const s = stateRef.current!;
    const real = Date.now();
    const dt = real - lastReal.current;
    lastReal.current = real;
    advance(s, s.now + dt * scaleRef.current);
    s.savedAtReal = real;
  }, []);

  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      sync();
      if (++ticks % 5 === 0) repo.save(stateRef.current!);
      bump();
    }, 1000);
    return () => clearInterval(id);
  }, [repo, sync]);

  const act = useCallback(
    <T,>(fn: (s: GameState) => T): T => {
      sync();
      const s = stateRef.current!;
      const out = fn(s);
      advance(s, s.now); // resolve anything that became due right now (e.g. a boss that just hit 0 HP)
      repo.save(s);
      bump();
      return out;
    },
    [repo, sync],
  );

  const skip = useCallback((ms: number) => act((s) => advance(s, s.now + ms)), [act]);

  const setScale = useCallback(
    (n: number) => {
      sync();
      scaleRef.current = n;
      setScaleState(n);
    },
    [sync],
  );

  const reset = useCallback(() => {
    repo.clear();
    stateRef.current = createFresh(settings);
    lastReal.current = Date.now();
    scaleRef.current = 1;
    setScaleState(1);
    bump();
  }, [repo, settings]);

  return { state: stateRef.current, scale, setScale, act, skip, reset };
}
