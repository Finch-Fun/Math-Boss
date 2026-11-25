// Reads the private Bonus Question bank (serverOnly/bonusBank) with the Admin SDK. Clients cannot read this document.
import type { Firestore } from 'firebase-admin/firestore';
import { BONUS_BANK_DOC, validateBonusBank, type BonusBankSource, type BonusQuestion } from './core/bonusBank';

export function firestoreBonusBank(db: Firestore): BonusBankSource {
  return {
    async load(): Promise<BonusQuestion[] | null> {
      const snap = await db.doc(BONUS_BANK_DOC).get();
      return snap.exists ? validateBonusBank(snap.data()) : null;
    },
  };
}
