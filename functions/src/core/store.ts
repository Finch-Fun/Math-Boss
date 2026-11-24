// Storage abstraction for the trusted game service. The service only ever talks to a Tx, so the same logic runs against
// Firestore (Admin SDK, functions/src/firestoreStore.ts) in production/emulators and against MemoryStore in unit tests.
export type Doc = Record<string, unknown>;

export interface Tx {
  get<T = Doc>(path: string): Promise<T | undefined>;
  getMany<T = Doc>(paths: string[]): Promise<(T | undefined)[]>;
  /** Documents of a collection, optionally filtered by one equality. Returns [id, data]. */
  list<T = Doc>(collectionPath: string, where?: { field: string; equals: unknown }, limit?: number): Promise<[string, T][]>;
  /** Buffered: applied atomically when the transaction commits. Service code reads first, then writes. */
  set(path: string, data: Doc): void;
}

export interface DocStore {
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export type ClockSource = (tx: Tx) => Promise<number>;

/** In-memory store with Firestore-like optimistic transactions: a commit fails and the callback re-runs if any document it read changed. */
export class MemoryStore implements DocStore {
  private docs = new Map<string, { data: Doc; version: number }>();
  /** Yield to the event loop on every read so concurrent transactions genuinely interleave (and conflict) in tests. */
  yieldOnRead = true;
  commits = 0;
  retries = 0;
  reads = 0;
  writes = 0;

  seed(path: string, data: Doc): void {
    const cur = this.docs.get(path);
    this.docs.set(path, { data: structuredClone(data), version: (cur?.version ?? 0) + 1 });
  }
  peek<T = Doc>(path: string): T | undefined {
    const d = this.docs.get(path);
    return d ? (structuredClone(d.data) as T) : undefined;
  }
  paths(prefix: string): string[] {
    return [...this.docs.keys()].filter((k) => k.startsWith(prefix));
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const seen = new Map<string, number>();
      const writes = new Map<string, Doc>();
      const tick = async () => {
        if (this.yieldOnRead) await new Promise<void>((r) => setImmediate(r));
      };
      const readOne = <D,>(path: string): D | undefined => {
        const d = this.docs.get(path);
        if (!seen.has(path)) seen.set(path, d?.version ?? 0);
        this.reads += 1;
        return d ? (structuredClone(d.data) as D) : undefined;
      };
      const tx: Tx = {
        get: async <D,>(path: string) => {
          await tick();
          return writes.has(path) ? (structuredClone(writes.get(path)) as D) : readOne<D>(path);
        },
        getMany: async <D,>(paths: string[]) => {
          await tick();
          return paths.map((p) => readOne<D>(p));
        },
        list: async <D,>(col: string, where?: { field: string; equals: unknown }, limit?: number) => {
          await tick();
          const out: [string, D][] = [];
          for (const [path, d] of this.docs) {
            if (!path.startsWith(col + '/') || path.slice(col.length + 1).includes('/')) continue;
            if (where && d.data[where.field] !== where.equals) continue;
            if (limit !== undefined && out.length >= limit) break;
            if (!seen.has(path)) seen.set(path, d.version);
            this.reads += 1;
            out.push([path.slice(col.length + 1), structuredClone(d.data) as D]);
          }
          return out;
        },
        set: (path, data) => void writes.set(path, structuredClone(data)),
      };
      const result = await fn(tx);
      await tick(); // the commit is a separate round trip, so other transactions can slip in between a read and the commit
      // Commit (synchronous section: validation and apply cannot interleave with another commit).
      let conflict = false;
      for (const [path, v] of seen) if ((this.docs.get(path)?.version ?? 0) !== v) conflict = true;
      if (conflict) {
        this.retries += 1;
        continue;
      }
      for (const [path, data] of writes) {
        const cur = this.docs.get(path);
        this.docs.set(path, { data, version: (cur?.version ?? 0) + 1 });
        this.writes += 1;
      }
      this.commits += 1;
      return result;
    }
    throw new Error('aborted: too much contention');
  }
}
