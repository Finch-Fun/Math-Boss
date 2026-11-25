# Live deployment (Firebase Hosting + Functions)

Workflow: **Claude → GitHub PR → merge → `npm run deploy:live` → test on the live site.**
The site lives at `https://<your-project-id>.web.app` (also `https://<your-project-id>.firebaseapp.com`). Nothing in this repository deploys
by itself, and no script ever uses `--force`.

## What gets deployed

| Piece | Source | Notes |
|---|---|---|
| Web app | `dist/` (Vite production build) | single-page app, all routes rewrite to `index.html`; hashed assets cached for a year, `index.html` never |
| Firestore rules | `firestore.rules` | unchanged and strict; clients cannot write coins, upgrades, boss/castle HP, and cannot read `serverOnly/*` |
| Firestore indexes | `firestore.indexes.json` | currently none needed |
| Cloud Functions | `functions/lib/index.js` (built by `npm run build:functions`) | callable functions (`mb*`), Node 22, max 5 instances, min 0, 256MiB, 15s |

The app uses **callable** functions (`onCall`) through the Firebase SDK, not plain HTTP endpoints. CORS is therefore enforced by Firebase using
`MATHBOSS_ALLOWED_ORIGINS`, which the deploy script sets to your two Hosting domains (plus a custom auth domain if you use one).
The emulator test clock function (`mbDevClock`) is only defined when `FUNCTIONS_EMULATOR=true` **and** `MATHBOSS_ENABLE_TEST_CLOCK=true`; the
deploy script refuses to run if either is present, so it does not exist in production.

## One-time setup (do once)

1. **Tools:** Node 22 or newer and git. In the repo: `npm install` and `npm --prefix functions install` (the Firebase CLI loads the Functions code locally to discover them).
2. **Sign in to Firebase with your own account:** `npx firebase login` (a browser window opens). Nothing in this repo asks for keys or passwords.
3. **Firebase console → Project settings → General → Your apps → Web app → SDK setup and configuration:** copy the values.
4. **Create `.env.production.local`** (gitignored) from the template and paste them in:
   ```powershell
   Copy-Item .env.production.example .env.production.local
   notepad .env.production.local
   ```
   Fill `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (and the optional two). Keep
   `VITE_FUNCTIONS_REGION=us-central1` and `VITE_USE_FIREBASE_EMULATOR=false`. Your `.env.local` is untouched, and the production values override it.
   The project id here is the **only** place the live project is chosen; the deploy script passes it explicitly to every Firebase command and
   refuses `demo-` projects. The checked-in `.firebaserc` stays on the emulator-only `demo-math-boss`.
5. **Authentication → Settings → Authorized domains:** confirm `<project-id>.web.app` and `<project-id>.firebaseapp.com` are listed (they are by default). Add any custom domain you use.
6. **Authentication → Sign-in method:** Google and Anonymous enabled (already done). **Firestore:** database created in production mode (done), teacher allowlist documents `teacherAllowlist/<lowercase email>` (done).
7. **First deploy only:** Firebase may ask to enable APIs (Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc is not needed). Allow it; your Blaze plan covers it. Hosting is created automatically by the first deploy.

## Deploy

After the PR is merged:

```powershell
git checkout main
git pull
npm install
npm --prefix functions install
npm run deploy:check     # optional dry run: tests, typecheck, builds, site scan; deploys nothing
npm run deploy:live      # the real deployment
```

`deploy:live` requires a clean, up-to-date `main`, then: validates your env (project, region, emulator off, no test clock) → writes
`functions/.env.<project-id>` (region + CORS origins) → `npm test` → typecheck → `vite build` → builds Functions → scans `dist/` for bonus-bank text →
`firebase deploy --project <id> --only hosting,firestore:rules,firestore:indexes,functions --non-interactive`.
Partial deploys: `npm run deploy:live -- --only hosting` (any of `hosting,functions,firestore:rules,firestore:indexes`). Deploying only the site never touches data.
The deploy never deletes Firestore data. If Firebase warns that deploying would delete a function, it stops and asks you; this script runs
non-interactively, so such a prompt is a failure, not a silent delete. Read the message and decide.

Region: the Functions deploy to `VITE_FUNCTIONS_REGION` (default `us-central1`). **Changing the region later** creates new functions and leaves the old
ones running; delete old ones with `npx firebase functions:delete <name> --project <id> --region <old-region>` only once the new site works.

## Private bonus bank

Bonus Questions stay **disabled** until `serverOnly/bonusBank` exists; Daily Review, upgrades, donations and combat work without it. To enable later:
prepare a private JSON file outside git, then `npm run seed:bonus -- ./bank.private.json --project <project-id> --live` (uses your own
`gcloud auth application-default login`). Never put the real bank in the repository.

## Logs and monitoring

* Function logs: `npx firebase functions:log --project <id>` or Console → Build → Functions → a function → Logs. Look for `mb internal error`.
* Firestore reads/writes: Console → Firestore → **Usage** tab. Expect low numbers; one read per listening student per shared-campaign change.
* Costs: Google Cloud console → Billing → **Reports** (filter by project). Functions: Console → Functions → Dashboard (invocations, instances).
* Hosting: Console → Hosting → Usage (storage and transfer).

## Costs and billing safeguards

Billing is not changed by this repo. Expect pennies at classroom scale: Functions (Cloud Run) have a free monthly allowance and are capped at 5 instances
with none kept warm; Firestore and Hosting have free daily/monthly quotas. Deploying uses Cloud Build and stores container images in Artifact Registry
(small storage cost). To limit image storage, run once: `npx firebase functions:artifacts:setpolicy --project <id>`.
**Budget alerts do not stop spending.** To set one: Google Cloud console → Billing → *Budgets & alerts* → Create budget → scope: the Math Boss project →
amount (for example $5/month) → alert thresholds 50%, 90%, 100% → email recipients. A true hard stop requires an automation that disables billing
(Pub/Sub + a function); it is not set up here and can take the live site offline if triggered.

## Roll back

* **Hosting (fastest):** Console → Hosting → *Release history* → the previous release → ⋮ → **Rollback**. Instant, no rebuild. Alternative: `git revert` the bad commit, then `npm run deploy:live -- --only hosting`.
* **Functions:** there is no one-click rollback. Fix forward or `git revert` and `npm run deploy:live -- --only functions`. (Advanced: each function is a Cloud Run
  service; Cloud Run → Revisions can shift traffic to an earlier revision.) The browser and the Functions are a matched pair: a site rolled back to an older version
  may call functions that changed, so roll both back together when an API changed.
* **Firestore rules:** Console → Firestore → Rules → history lets you restore an earlier published version, or revert in git and `--only firestore:rules`.
  Rules and Functions change together (for example, removal requires `mbRemoveStudent`), so never roll back one without checking the other.
* **Data is never rolled back** by any of this. Game state written by the Functions stays as written.

## Future updates (minimal steps)

Merge the PR, then: `git checkout main; git pull; npm run deploy:live`. (Run `npm install` only if dependencies changed.)

## First live smoke test (throwaway classroom, test accounts only)

Use one teacher Google account and two dummy students (two other browsers or private windows, each signing in anonymously). Do not touch real classrooms.

1. [ ] **Teacher sign-in:** open the live URL, sign in with Google using an allowlisted account; the teacher dashboard appears.
2. [ ] **Classroom:** create a throwaway classroom ("ZZ Test"); note the join code.
3. [ ] **Join + approval:** in two other browsers join as "Test A" and "Test B"; both show pending; approve both as teacher (or use auto-approve).
4. [ ] **Shared boss HP:** after both are active, the boss/castle numbers match on all three browsers and move together after a refresh.
5. [ ] **Daily Review rewards:** each student answers correctly; coins increase (10/5/2 pattern) and a wrong answer is counted but not paid.
6. [ ] **Upgrades:** buy a permanent upgrade; coins drop, level persists after reload.
7. [ ] **Projects/donations:** donate coins to a castle project; funded amount is the same on every browser.
8. [ ] **Offline settlement:** close Test B's tab for a few hours (or overnight); reopen: combat progressed while away and Test B's contribution is included.
9. [ ] **Weekly state:** the campaign shows the correct week, boss phase and countdown for the classroom time zone.
10. [ ] **Removal:** as teacher, remove active student Test B; their damage stops immediately (the class DPS drops at once and the boss HP rate changes), and Test B can no longer play.
11. [ ] **Role isolation:** while signed in as a student, `/` shows only student gameplay: no teacher dashboard, no developer/simulation tools, and no way to reach another classroom.
12. [ ] **No bonus answers in the frontend:** with the bonus bank missing, Bonus Questions are shown as unavailable; if you seeded a bank, open DevTools → Sources/Network and confirm answers appear only after you answer (search the page source for a known answer: it must not be there).
13. [ ] **Direct write blocked:** (optional) in the DevTools console a student's direct write to coins/upgrades/boss HP is denied by Firestore.

Clean up by deleting only the throwaway classroom in the console (leave real classrooms alone).
