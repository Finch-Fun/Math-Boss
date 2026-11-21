import { STATE_VERSION } from '../game/constants';
import type { GameState } from '../game/types';

/**
 * Persistence boundary. The prototype uses browser storage; a Firebase-backed implementation
 * can replace this later without touching src/game (the rules engine has no browser or network dependencies).
 */
export interface GameRepository {
  load(): GameState | null;
  save(state: GameState): void;
  clear(): void;
}

export class LocalStorageRepository implements GameRepository {
  private readonly key: string;

  constructor(key = 'math-boss-prototype-v1') {
    this.key = key;
  }

  load(): GameState | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameState;
      return parsed.version === STATE_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }

  save(state: GameState): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch {
      // storage full or unavailable: the prototype keeps running in memory
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
