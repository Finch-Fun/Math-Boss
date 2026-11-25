// Writes the PRIVATE Bonus Question bank to Firestore (serverOnly/bonusBank) with the Admin SDK.
//   Emulator:  npm run seed:bonus:emulator
//   Live:      npm run seed:bonus -- path/to/your-private-bank.json --project <firebase-project-id> --live
// The live form uses your own Google credentials (`gcloud auth application-default login`). It is NEVER run by CI or by any other
// script here. Keep your real bank file OUT of git (this repository is public).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateBonusBank, BONUS_BANK_DOC } from '../functions/src/core/bonusBank';
import { parseSeedArgs, planSeed } from '../functions/src/seedPlan';

const args = parseSeedArgs(process.argv.slice(2));
const raw = JSON.parse(readFileSync(args.file ?? '', 'utf8'));
const questions = validateBonusBank(raw);
const plan = planSeed(args, raw.devOnly === true);

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
if (plan.target === 'emulator') process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
initializeApp({ projectId: plan.project });
await getFirestore().doc(BONUS_BANK_DOC).set({ questions, updatedAt: Date.now(), ...(raw.devOnly === true ? { devOnly: true } : {}) });
console.log(`Seeded ${questions.length} bonus questions into ${plan.target === 'emulator' ? 'the local emulator' : `LIVE project ${plan.project}`}.`);
