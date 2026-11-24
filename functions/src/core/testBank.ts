// Test/emulator-only Bonus Question fixture (functions/dev-fixtures/bonus-bank.dev.json). Public on purpose and clearly fake.
import { readFileSync } from 'node:fs';
import { validateBonusBank, type BonusQuestion } from './bonusBank';

export const DEV_FIXTURE_PATH = new URL('../../dev-fixtures/bonus-bank.dev.json', import.meta.url);
export const DEV_BANK: BonusQuestion[] = validateBonusBank(JSON.parse(readFileSync(DEV_FIXTURE_PATH, 'utf8')));
