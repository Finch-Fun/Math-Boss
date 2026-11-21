# Math Boss

Cooperative classroom math game. See [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) (v1.3) for the full design.

**This branch is a playable prototype**: local mock data and browser storage only. No Firebase, no authentication, no real student data.

## Run

```bash
npm install
npm run dev        # play at the URL Vite prints
npm test           # game-rule tests (Node's built-in test runner, no extra dependencies)
npm run typecheck
npm run build
```

Use the **Student**, **Teacher** and **Developer** tabs at the top. The Developer tab speeds up time, grants coins, defeats the boss, forces a castle breach, and resets all saved progress.

## Layout

- `src/game/` - the rules engine. Plain TypeScript with no React, browser or network dependencies, so it can later run unchanged in a trusted backend (design §21.1).
- `src/storage/repository.ts` - the persistence interface. `LocalStorageRepository` is the only implementation; swap in a Firebase one later.
- `src/ui/` - React views.

The battle is **event-driven**: between events (boss death, boss attack, training end, week rollover, simulated classmate sessions) class DPS is constant, so damage is computed from elapsed time. Offline progress, live play and the developer time-skip all use the same `advance(state, targetTime)` function.

## Implementation decisions (design ambiguities)

- **Game clock.** The prototype clock starts Monday 8:00 AM and runs at real time (or the developer speed). It is saved with the state and catches up when the page reopens (capped at 8 weeks).
- **Castle before the first activation (§10.2, §26.5).** The boss's attack timer does not start until the first student activates, so the class never takes damage before it could act. A zero-question week activates everyone immediately.
- **Boss attack scales with class size** (110/hour is for 25 students, scaled linearly). Castle HP is 400 per student.
- **Boss 1 HP** = expected class DPS x 30 combat hours x difficulty. Expected DPS averages each student's current DPS with their DPS after spending a week's expected coins (70% of earnings go to personal upgrades), times recent participation (default 85%). HP is fixed at spawn.
- **Upgrades.** Attack Damage +1 (x1.15 price), Attack Speed +0.05/sec (x1.18), Crit Chance +1 point (x1.2, capped at 40%), Crit Damage +0.10x (x1.18, capped at 3.0x). Price growth is computed with exact fractions to avoid floating-point rounding.
- **Projects.** Base prices scale with class size (the design's figures are for 25). Repeat purchases cost x1.5. Walls max 5 (+10% each), Plating max 10 (+5 points each, 50% cap), Banner max 5 (+5% each, +25% cap), Repairs unlimited.
- **Emergency repair (§15.1, rates left open).** Auto-reconstruction is 0.5% of max HP per hour. Each correct Daily Review answer during a breach adds 0.1% of max HP. No coins are involved.
- **Weekly reset keeps coins and upgrades.** A new boss never spawns in the final two hours; leftover time after training shows "Campaign nearly over".
- **Simulated classmates** (24 of 25) are deterministic: they attend school days only, with different accuracy, attendance, spending strategies and donation habits.
- **Questions** are generated from verified templates (six skills, three difficulties), deterministic per student/week/index so refreshing never changes the question. Bonus Questions come from a small fixed bank (three per week).
- **Daily Review unlocks** by weekday. Unfinished questions carry over through the week.

## Balance observation (provisional numbers)

With the design's numbers, a 25-student castle has 10,000 HP but Boss 1 deals 110/hour, which is 18,480 over a full week, and later bosses hit harder. Running the simulated classroom for 12 weeks gave 2 bosses per week and a castle ending the week at 0-7% HP, usually with a breach. Castle defense is therefore the binding constraint, not boss HP. This needs a decision in Milestone 0 balance testing; the prototype has not changed any values.

## Not built yet

Real accounts, teacher-created questions, skill-level reports, school leaderboards, a full question bank, and Firebase.
