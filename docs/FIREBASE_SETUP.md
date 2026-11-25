# Firebase setup (Milestone 1)

> Going live? The Hosting + Functions deployment workflow is in [LIVE_DEPLOYMENT.md](LIVE_DEPLOYMENT.md). This page covers the original setup and local emulators.

Math Boss uses its **own** Firebase project, separate from any other project. Nothing here creates resources, enables billing, or deploys. You run these steps yourself.

Without any Firebase settings the app runs in **demo mode** (the simulated class, saved in your browser). Firebase mode turns on automatically once `.env.local` is complete.

## One-time setup

1. **Create a project** at <https://console.firebase.google.com> (for example `math-boss-pilot`). Stay on the **Spark (free)** plan. Google Analytics is not needed.
2. **Authentication → Sign-in method:** enable **Google** (teachers, and optional student account linking) and **Anonymous** (students).
3. **Authentication → Settings → Authorized domains:** add the domain you will serve the app from (`localhost` is there by default).
4. **Firestore Database → Create database:** choose a region near the school, **production mode**.
5. **Project settings → Your apps → Web app:** register an app and copy its config into `.env.local` (copy `.env.example`; keys are `VITE_FIREBASE_*`). Never commit `.env.local`.
6. **Approve your teachers.** In Firestore, create the collection `teacherAllowlist`. For each teacher add a document whose **ID is their lowercase Google email** (for example `ms.rivera@school.org`) with any one field (for example `addedBy: "admin"`). Clients can never read or write this collection, so this console step is the only way to make someone a teacher. Delete the document to revoke access immediately.
7. **Publish the security rules** (when you are ready, from this repository):
   ```bash
   cp .firebaserc.example .firebaserc      # then put your project id in it
   npx firebase login
   npx firebase deploy --only firestore:rules
   ```
   Rules are not deployed automatically by anything in this repository.
8. `npm install && npm run dev`.

## Local development without a real project (emulators)

Needs Java 11+ and `npm install` (installs `firebase-tools`).

```bash
npm run emulators                     # Auth :9099, Firestore :8080, UI :4000
# in .env.local:
VITE_USE_FIREBASE_EMULATOR=true
npm run dev
```

Add your test teacher's email to `teacherAllowlist` through the emulator UI (<http://localhost:4000>, Firestore tab), then use "Sign in with Google" and pick or create an emulator account with that email. Emulator data is wiped when the emulators stop.

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | Game rules, balance simulator, join-code and input validation, demo/Firebase mode separation, architecture and rules drift guards | Node only |
| `npm run test:rules` | The Firestore security rules against the emulator: teacher roles, ownership, joining, unauthenticated access, cross-classroom isolation, no client-written coins | Java + `npm install` |
| `npm run typecheck` / `npm run build` | TypeScript and production bundle | `npm install` |

## How roles work

* **Teacher** = signed in with Google, email verified, and the email is in `teacherAllowlist`. The rules check this on every teacher operation, so removing the allowlist document revokes access at once. There is no role field in any client-writable document.
* **Student** = any other signed-in user (anonymous by default). Students only ever get access through a membership document keyed by their own UID.

## Joining flow (no backend required)

1. A teacher creates a classroom. The app writes the classroom plus a `joinCodes/{CODE}` lookup document in one batch.
2. A student enters the code. The app reads `joinCodes/{CODE}` (exact lookup; listing is denied) and writes `classrooms/{id}/members/{studentUid}` containing the code as proof, plus a `studentClassrooms/{uid}/classrooms/{id}` pointer so the student can find the classroom again.
3. The rules accept the membership only if the code equals the classroom's current code, the classroom is active, the document ID is the student's own UID, and the status is exactly what the classroom setting dictates: `pending` (teacher approves, the default) or `active` (auto-approve).
4. On approval the teacher's app creates `classrooms/{id}/players/{uid}` with **zero coins and zero upgrades**. That is the only player write the rules allow; there is no update rule.

Join codes are 8 characters from a 31-symbol alphabet (about 8.5 × 10¹¹ combinations), generated with the browser's cryptographic random source. Firestore rules cannot rate-limit guesses, so for a public deployment enable **App Check** and keep teacher approval on (a guessed code alone never grants access to anything).

## Student identity: what anonymous sign-in does and does not give you

Students use **Firebase anonymous authentication**. It creates a real, persistent Firebase UID that is remembered in the browser (IndexedDB), so a student who comes back on the same device and browser is the same person automatically, and all classroom membership hangs off that UID.

It is **not** an account the student can recover. If the student clears site data, uses a private window, or switches to another device or browser, they get a new, empty identity and cannot get the old one back by themselves. Two ways to handle this in the pilot:

* **Link a Google account** (button on the student screen). The UID stays the same and the student can sign in from anywhere. This works with school Google accounts, and the app stores no name or email of its own (Firebase Auth holds the email).
* **Teacher re-approval.** If a student loses their identity, they join again with the class code and a nickname, and the teacher removes the old entry. Progress cannot be moved between identities in this milestone (coins are not live yet, so nothing is lost today).

Teacher-managed student accounts and one-time recovery codes need a trusted backend and are left for a later milestone. The code deliberately avoids "nickname-only" logins, which anyone could impersonate.

## Data model

| Path | Who can read | Who can write |
|---|---|---|
| `teacherAllowlist/{email}` | nobody | console / Admin SDK only |
| `teacherProfiles/{uid}` | that teacher | that teacher (display name and email only, allowlisted teachers only) |
| `classrooms/{id}` | owning teacher; active members | owning teacher (settings, name, code, archive). No deletes. |
| `joinCodes/{CODE}` | any signed-in user, exact lookup only | owning teacher |
| `classrooms/{id}/members/{uid}` | that student; owning teacher | student creates their own pending/active entry; only the owning teacher changes status |
| `classrooms/{id}/players/{uid}` | that student; owning teacher | **create only, with zero values** (teacher on approval, or student when auto-approved). Never updated by a client. |
| `studentClassrooms/{uid}/classrooms/{id}` | that student | that student, create only, and only alongside a membership |
| `classrooms/{id}/battle/*` | owner; active members | **nobody** (the trusted Cloud Functions write it; see docs/MULTIPLAYER.md) |

Classroom documents hold: owner UID, name, grade level, timezone, join code, join approval mode, active/archived status, settings (Daily Review questions per day, difficulty preset, skills, bonus questions, boss difficulty), and created/updated timestamps. Defaults come from the game design (`defaultSettings()`), and balance values are untouched.

## Demo mode vs Firebase mode

* **Demo mode:** the whole prototype (Daily Review, Bonus Questions, coins, four upgrades, upgrade subtraction, boss and castle, shared projects, Developer tools, Teacher Battle Report) against a simulated class saved in `localStorage`. No Firebase code is loaded.
* **Firebase mode:** sign-in, classrooms, join codes, roster and approval, settings, and persistent membership are real and stored in Firestore. Gameplay shown inside a classroom (the "Demo gameplay" tab for teachers, "Practice" for students) is the same local simulation, seeded with the classroom's settings, saved under a per-user, per-classroom local key, and **clearly labelled as not shared**. Nothing from it is written to Firestore.

## Roles, navigation and developer tools

| Who | Sees | Never sees |
|---|---|---|
| Student (Firebase) | Student gameplay only: Daily Review, Bonus Questions, upgrades, boss and castle, shared projects, their own membership. No view switcher at all. | Teacher view, Battle Report, roster, settings, developer tools |
| Approved teacher | My Classrooms, roster and approvals, join code, settings, and a **Demo gameplay** preview (Student and Teacher/Battle Report views of a *simulated* class) | Developer tools |
| Local development (`npm run dev`) | Demo from the entry screen with Student, Teacher and **Developer (simulation)** views | n/a |
| Production build | No developer tools, and no demo entry when Firebase is configured | n/a |

How it is enforced:

* **Structure, not hidden buttons.** `src/cloud/access.ts` decides which views a screen may mount (`student-practice`: Student only; `teacher-preview`: Student and Teacher; `demo`: all). `GameWorkspace` clamps any requested view to that list, so the Teacher and Developer components are never rendered for a student, whatever the UI state says. The app has no URL routes, so there is no deep link to bypass.
* **Developer tools are a build-time feature.** `src/ui/devTools.tsx` checks `import.meta.env.DEV`, which Vite turns into a literal: in `vite build` the DevPanel module and `game/dev` helpers are not emitted (a test bundles both ways and checks). It does not read a user, role or Firestore field. Only the local demo is ever handed the tools.
* **Preview and practice never write to Firebase.** The local game views have no access to the Firebase layer (a test checks their imports); they save to per-user localStorage keys and are labelled simulated.
* **Real data is protected by `firestore.rules`**, unchanged by this change apart from extra tests: ownership and membership checks, no client-written coins, upgrades, boss or castle state.

## What works on the free Spark plan, and what will not

Works on Spark: Google and anonymous sign-in, Firestore with these rules, emulators, and everything in this milestone. Reads are on demand (no live listeners, no polling), and writes happen only on classroom or roster changes. Rule lookups (`exists`/`get`) count as reads; at pilot size this is far below the free daily quota.

Will need more than client-only code (multiplayer milestone):

* **Authoritative coins, upgrades, answer checking, boss and castle damage.** The rules above guarantee clients cannot write these, so someone trusted has to. Today the questions and answers are generated in the browser, so a determined student could cheat in any client-side design. Options: (a) Cloud Functions, which require the **Blaze** plan (pay-as-you-go with a free allowance; you can set a budget alert); (b) a small server elsewhere that holds Admin SDK credentials; (c) for a first pilot, accept an honor system and have the teacher confirm progress. None of these is built or enabled here.
* **Rate limiting join-code guesses and student account recovery** also benefit from a backend (or App Check at minimum).

## Production deployment prerequisites (multiplayer)

Nothing here is done by the repository; run each step yourself. Do not deploy until all are checked.

1. Firebase project on Blaze, with a Google Cloud budget alert (Blaze has no hard cap). Enable Authentication providers Google and Anonymous, and add your hosting domain to authorized domains.
2. Create teacher allowlist docs `teacherAllowlist/{lowercased email}` (Admin console or Admin SDK).
3. Prepare the real bonus bank as a JSON file kept OUT of git (`*.private.json` is ignored), shape `{ "questions": [{ "id", "prompt", "choices", "correct", "explanation" }] }`, at least 3 questions. Do not reuse the old public demo questions.
4. Seed it with your own credentials (`gcloud auth application-default login`): `npm run seed:bonus -- ./bank.private.json --project <PROJECT_ID> --live`.
5. Set the Functions region and origins in `functions/.env`: `MATHBOSS_FUNCTIONS_REGION=<region>` (default us-central1) and `MATHBOSS_ALLOWED_ORIGINS=https://<your-hosting-domain>`. Build the web app with the matching `VITE_FUNCTIONS_REGION` and the `VITE_FIREBASE_*` values, and with `VITE_USE_FIREBASE_EMULATOR` unset or false.
6. Make sure `MATHBOSS_ENABLE_TEST_CLOCK` and `FUNCTIONS_EMULATOR` are not set in the production environment.
7. `npm --prefix functions install`, `npm run build:functions`, then deploy `firestore:rules`, `firestore:indexes` and `functions` (rules and Functions must ship together because removal now requires `mbRemoveStudent`).
8. Smoke test on a throwaway classroom: join, approve, answer, bonus (confirm answers appear only after answering), remove an active student and confirm the damage stops. Consider enabling App Check.
