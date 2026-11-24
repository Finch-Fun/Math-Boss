// Firestore (Admin SDK) implementation of the DocStore used by the trusted game service. Admin writes bypass security
// rules, which is why every authorization check lives in functions/src/core/service.ts and not in the rules.
// NOT exercised by `npm test` (needs firebase-admin and the Firestore emulator): see docs/MULTIPLAYER.md for how to run it.
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { Doc, DocStore, Tx } from './core/store';

export class FirestoreStore implements DocStore {
  constructor(private db: Firestore) {}

  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (t: Transaction) => {
      const writes: [string, Doc][] = [];
      const tx: Tx = {
        get: async <D,>(path: string) => {
          const snap = await t.get(this.db.doc(path));
          return snap.exists ? (snap.data() as D) : undefined;
        },
        getMany: async <D,>(paths: string[]) => {
          if (!paths.length) return [];
          const snaps = await t.getAll(...paths.map((p) => this.db.doc(p)));
          return snaps.map((s) => (s.exists ? (s.data() as D) : undefined));
        },
        list: async <D,>(col: string, where?: { field: string; equals: unknown }, limit?: number) => {
          let q: FirebaseFirestore.Query = this.db.collection(col);
          if (where) q = q.where(where.field, '==', where.equals);
          if (limit !== undefined) q = q.limit(limit);
          const snap = await t.get(q);
          return snap.docs.map((d) => [d.id, d.data() as D] as [string, D]);
        },
        set: (path, data) => void writes.push([path, data]),
      };
      const result = await fn(tx);
      // Firestore requires every read to happen before any write; the service buffers writes, so apply them now.
      for (const [path, data] of writes) t.set(this.db.doc(path), data);
      return result;
    });
  }
}
