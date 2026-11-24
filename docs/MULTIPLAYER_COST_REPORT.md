# Multiplayer cost and performance report (PR #6)

All figures are **estimates from the code's actual access pattern**, not measurements: the Firestore/Functions emulators were not run
in the environment that built this PR. Re-check unit prices on the Firebase pricing page before relying on any dollar figure.

## What one trusted operation costs

Every mutating request (answer, bonus, upgrade, donation) is one callable invocation and one transaction:

| Item | Count |
|---|---|
| Function invocations | 1 |
| Firestore reads | **5** (classroom, member, player, campaign, server-only salt) + 1 allowlist read only for students linked to Google |
| Firestore writes | **2** (campaign + player). The salt document is written once per classroom |
| Roster reads | only when a boss spawns or a week starts: 1 member query (N docs) + N player docs = about **2N**, roughly 12N per week |

Combat itself costs **nothing per hit**: damage is settled in closed form from the stored last-settled timestamp and the aggregate DPS,
so offline progress adds zero reads or writes until the next request.

## Assumptions

* Students stay activated all week. Ordinary: 20 trusted operations per student per school day (about 10 answers, a few wrong attempts, an
  upgrade or two, a donation). Heavy: 60 per student per day (3x). The per-player limit is 40 accepted operations per minute.
* Every student of the class has the app open at once (worst case for listeners).
* Listeners: one shared `battle/campaign` listener per online student (every campaign write is billed as one read per listener), one
  own-player listener, one teacher Battle Report listener.
* Daily figures for a school day.

| Students | Load | Ops/day | Firestore reads/day | Firestore writes/day | Reads vs 50k/day free | Writes vs 20k/day free |
|---:|---|---:|---:|---:|---:|---:|
| 10 | ordinary | 200 | 3,500 | 400 | 7% | 2% |
| 10 | heavy | 600 | 10,300 | 1,200 | 21% | 6% |
| 25 | ordinary | 500 | 16,250 | 1,000 | 33% | 5% |
| 25 | heavy | 1,500 | 48,250 | 3,000 | 96% | 15% |
| 40 | ordinary | 800 | 38,000 | 1,600 | 76% | 8% |
| 40 | heavy | 2,400 | 113,200 | 4,800 | 226% | 24% |
| 100 | ordinary | 2,000 | 215,000 | 4,000 | 430% | 20% |
| 100 | heavy | 6,000 | 643,000 | 12,000 | 1,286% | 60% |

Function invocations equal "Ops/day" (plus one `sync` per page load). That is at most about 6,000 a day, or 180,000 a month at the heaviest 100-student
load, far inside the 2M/month Blaze free tier.

**The dominant cost is listener fan-out, not the game logic.** Reads grow with students squared (each campaign write is delivered to every
online student). Writes stay small. Up to about 25 students the design fits the daily free read quota; at 40 and above the
read quota is the first limit you hit, and at 100 students it is exceeded by several times even on ordinary days.

## Aggregate settlement versus per-hit writes

| Students | Per-hit writes/day (1 hit/s per activated student, 6 class hours) | Aggregate writes/day (ordinary) |
|---:|---:|---:|
| 10 | 216,000 | 400 |
| 25 | 540,000 | 1,000 |
| 40 | 864,000 | 1,600 |
| 100 | 2,160,000 | 4,000 |

Per-hit writes would exceed the 20k/day write quota at every class size, and offline hits would need a scheduler on top. Aggregate
settlement is roughly 500x cheaper and does not depend on any open browser.

## Hot documents and contention

* **`classrooms/{id}/battle/campaign` is the hot document.** Every trusted operation reads it and most write it. Firestore's documented
  guideline is roughly one sustained write per second per document. A 25-student class stays well under that (about 500 operations over
  a class period). At 100 students answering in bursts of several operations per second, transactions will queue and retry and some
  callers can see slow or `aborted` responses. Mitigations if that happens: stop persisting pure settlements for ops that do not change
  shared state (wrong answers, bonus answers), shard the weekly counters, or raise the per-student pacing.
* The per-player document is only contended by that student's own double-clicks, which the idempotency ledger and the stale-request check absorb.
* Boss spawns and week starts read the whole roster inside the transaction (about 2N reads). That is rare (a handful per week).
* A long absence is bounded: at most 8 weeks are simulated, older weeks are skipped by calendar arithmetic only.

## Free quotas versus hard limits

* **Spark (no billing):** the emulators are free and are all this PR needs. **Cloud Functions cannot be deployed on Spark.** Running this game for real
  needs the Blaze plan. Quotas on Spark are hard stops (the service stops working for the day when exceeded).
* **Blaze:** the same daily Firestore free quota (50k reads, 20k writes, 20k deletes) and a monthly Functions free tier apply, but usage beyond
  them is **billed with no automatic cap**. A budget alert only notifies you; it does not stop spending. Being inside the free tier today is not a
  guarantee of zero charges (listener fan-out, a bug that loops, abusive traffic and egress can all push it over). Set a budget alert and use
  `maxInstances` (set to 10 here).
* **Hard technical limits that are not about money:** 1 MiB per document (the campaign document stays a few KB), the per-document write guideline above,
  and transaction retry limits.
* Not covered: Auth usage, network egress, Cloud Build/Artifact Registry charges when deploying, App Check.

## Abuse controls and what is not covered

Per-student operation limit (40 per minute), request-id idempotency, bounded donation amounts, and server-validated everything. Not covered:
volumetric abuse by someone with a valid anonymous account still costs reads before the limit rejects. Firebase App Check is the right
extra defence before real deployment.

## Offline behaviour

There is **no scheduled function** and no recurring billable job. If nobody opens the app, Firestore is not updated; the missed time is
settled exactly on the next trusted request (including a teacher opening the Battle Report). Strict real-time progression of an unattended
campaign would require a scheduled function (Blaze plus a Cloud Scheduler job); this PR deliberately does not add one.

## Production-readiness additions

* Function options (`functions/src/config.ts`): `maxInstances` 5, `minInstances` 0, 256MiB, 15s timeout, one region, CORS limited to
  `MATHBOSS_ALLOWED_ORIGINS`. There is no scheduled or trigger function, so nothing bills while idle. Blaze has no hard spending cap: set
  budget alerts in Google Cloud.
* Listener fan-out is the dominant read cost (one read per listener per campaign write). Pure time advances are no longer written, hidden
  tabs detach their listeners after 2 minutes, and listener dependencies are stable, which removes most redundant reads.
* The bonus bank costs at most one extra read per instance per 10 minutes (cached; a failed load is cached 60s).
* Roster reads are bounded at 200 students.
