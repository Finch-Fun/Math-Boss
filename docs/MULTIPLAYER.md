# Real multiplayer combat and economy (PR #6)

The Firebase classroom now plays one shared, **server-authoritative** campaign. Coins, answer checking, upgrades, damage, boss and castle
state, donations, offline progress and weekly resets are all decided by a trusted game service (TypeScript Cloud Functions with the Admin SDK).
The browser sends intent only (which answer, which upgrade, how many coins to donate); it can no longer assign coins, damage or time.
Demo mode and the teacher/student role restrictions from PR #5 are unchanged. Demo mode is still local and simulated.

## Run it locally (Windows PowerShell)

Prerequisites: Node 20 or newer, Java 11 or newer (for the Firestore emulator).

```powershell
npm install
npm --prefix functions install
npm run emulators          # Auth :9099, Firestore :8080, Functions :5001, UI http://127.0.0.1:4000
# in a second PowerShell window:
npm run dev:emulator       # the app, pointed at the emulators only (project id demo-math-boss)
```

For simulations of weekly rollover and boss timing, start the emulators with the test clock instead:

```powershell
npm run emulators:dev      # same, with the emulator-only test clock enabled
```

Then use "Developer: emulator test clock" in the teacher's classroom dashboard (development builds only). Nothing here talks to a live project:
`demo-` project ids cannot reach production, nothing is deployed and no billing is involved.

Tests:

```powershell
npm test                   # unit + in-memory service tests (no Java needed)
npm run test:rules         # Firestore rules tests (needs the emulator)
npm run test:integration   # real Auth + Firestore + Functions emulators, end to end
```

## Architecture

* `src/game/campaign.ts`, `src/game/zoned.ts`: pure rules. Aggregate settlement (closed-form attacks, per-student damage recovered from a
  shared accumulator), timezone and DST-correct weeks.
* `functions/src/core/service.ts`: the trusted service. One transaction per operation. `store.ts` is the storage abstraction
  (`functions/src/firestoreStore.ts` for Firestore, an in-memory store with optimistic concurrency for tests).
* `functions/src/index.ts`: thin callable wrappers (`mbSync`, `mbGetDaily`, `mbSubmitDaily`, `mbGetBonus`, `mbSubmitBonus`, `mbPurchaseUpgrade`, `mbDonate`, `mbRemoveStudent`).
  Identity comes from the verified token, never the request body.
* Client: `src/ui/cloud/MultiplayerStudent.tsx`, `SharedBattle.tsx`, `useMultiplayer.ts` (listeners and estimation), `src/cloud/liveState.ts` (pure helpers).

Firestore data (all server-written; see `firestore.rules`): `classrooms/{id}/battle/campaign` (shared, readable by members and the owner),
`players/{uid}` (coins, upgrades, weekly progress; readable by the owner and that student), `serverOnly/*` (question salt, test clock;
no client access).

## How it behaves

* **Combat is aggregate.** The campaign stores a last-settled timestamp and the class's combined DPS. Each trusted request settles the elapsed
  time chronologically (boss defeat, 24h preparation, hourly attacks with armor, breach, recovery, week end, no boss spawn in the final 30 hours)
  inside the transaction. Concurrent requests serialize, so time and damage are never counted twice. There is no per-hit write.
* **Offline.** Activated students keep dealing damage while away; the result is applied on the next trusted request. **There is no scheduled
  job**, so an unattended classroom does not change in Firestore until someone (student or teacher) makes a request. Clients show a smooth
  estimate between updates, but only server results are final.
* **Questions.** Daily answers are checked on the server against questions generated with a secret per-classroom salt, so they cannot be derived
  from the public generator. Rewards are 10/5/2 once per question; wrong attempts are counted on the server. Bonus questions allow one attempt.
  **Bonus bank is private.** The repo is public, so the real bank is NOT in source. It lives in Firestore `serverOnly/bonusBank` (denied to every
  client by the rules), is loaded by the Functions with the Admin SDK (cached 10 min) and is seeded by `npm run seed:bonus`. If it is missing
  or invalid the Bonus Questions fail closed (disabled, nothing is paid). The browser only receives prompts and choices; `correct` and the
  explanation are returned only after the student's single answer. Demo mode keeps its public `DEMO_BONUS_BANK`, which the server never uses.
  `functions/dev-fixtures/bonus-bank.dev.json` is a fake, `devOnly` bank for tests and the emulator; it cannot be seeded into a live project.
  Tests assert the browser bundle contains no bonus question text and that `src/` never imports from `functions/`.
* **Weeks.** Monday 12:00 AM to the next Monday in the classroom timezone (167 or 169 hour weeks across DST). Weekly progress resets lazily;
  coins and upgrades persist.
* **Removal.** Removing or rejecting an active student goes through the trusted `mbRemoveStudent` callable (owner teacher only). It settles the
  class to the server time, folds the student's damage up to that instant, removes their DPS from the aggregate and then marks them removed, all
  in one transaction, so damage stops at the effective removal time (including offline settlement and concurrent requests). Rules forbid
  direct active-to-removed writes and deleting active members. Coins and upgrades are kept; restoring the student re-activates them next week.
* **Reads.** Every write to the shared campaign document is delivered to every listening student. The service therefore writes it only on
  discrete changes (activation, upgrade, donation, boss or week events); elapsed time alone is recomputed deterministically and not written.
  Browser listeners detach after the tab has been hidden for 2 minutes and re-sync on return. Rosters are capped at 200 students.
* **Limits and notes.** Project costs use the class size at week start.
  Per-student hit attribution is recovered from the accumulator rather than stored per hit.

## Verified and not verified

See the PR description for the exact list of what ran. The Functions code path through `firebase-admin`/`firebase-functions`, the Firestore rules
tests and the emulator integration test were written but could not be run where this was built.
