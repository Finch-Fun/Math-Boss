# Math Boss: Balance Validation Report (prototype)

Scope: one validation pass over the provisional combat values in `docs/GAME_DESIGN.md` v1.3.

**Status: Package P (section 4) was approved by the owner for prototype testing and is now applied.** The defaults live in `DEFAULT_TUNING` (`src/game/constants.ts`) and a unit test pins them. They equal the design document except `noSpawnWindowHours` 2 -> 30 and `bossAttackPerHourRef` 110 -> 120. Sections 2-3 describe the *original* values; section 4 results were re-confirmed on the final defaults (identical output to the pre-change sweep).

Reproduce the "original values" tables with `npm run balance -- sweep --grid '{"noSpawnWindowHours":[2],"bossAttackPerHourRef":[110]}'`, and the final ones with `npm run balance -- study` (add `--weeks 30 --seeds 6` for the numbers quoted here), `-- curve`, `-- sweep --grid '{...}'`.
Source: `src/sim/balanceSim.ts` (simulator), `src/sim/cli.ts` (reports and acceptance criteria).

## 1. Method

- The real rules engine runs a full class: bots answer questions, earn coins, buy personal upgrades and donate to shared projects.
- 15-minute stepped phase accounting gives hours spent in combat, waiting, training, breach and idle.
- Deterministic seeded cohorts (6 per cell, 30 weeks). Engagement, accuracy and session time are jittered per cohort.
- Donation rate is the share of earned coins donated. Each week's actual rate swings +/-50% (`donationSpread`), because real classes do not donate at a constant rate.
- Cells: class size 10 / 25 / 40, donation low (~5%) / mixed (~15%) / moderate (~26%) / high (~42%).
- Attendance stress: all students engage at 60% of the baseline (`--attendance 0.6`).

## 2. Findings with the provisional values

**Boss combat hours (25 students, moderate donations).**

| Item | Hours |
|---|---|
| Boss 1 active combat | 38.6 (design target: 30) |
| Boss 2 active combat | 45.6 |
| Boss 3 | never beaten; it spawns late in the week |
| Training (2 x 24h) | 48.0 |
| Waiting for the first activation | 8.4 |

Combat hours total about 110 per week at every class size, so the 24-hour training breaks fit with two victories.
Boss 1 runs about 29% longer than the 30-hour target, which is an acceptable calibration miss.

**Class size.** Breach rate and castle HP differ by at most 3 points across 10, 25 and 40 students at moderate and high donation levels.
Per-student scaling works.

**Donation level (25 students, 30-week average).**

| Donations | Breach weeks | Median castle at week end |
|---|---|---|
| low (5%) | 100% | 8% |
| mixed (15%) | 61% | 7% |
| moderate (26%) | 18% | 12% |
| high (42%) | 2% | 24% |

Victories are not the problem: every cell averages 1.75-2.00 bosses per week.
Castle defense is: with moderate donations the castle still ends the week near its floor, and 61% of weeks at mixed donations include a breach.

**Where breaches come from.** 80% of breaches begin on Sunday and the rest on Friday.
They almost always come from Boss 3, which the class spawns about 27 hours before week end and which needs roughly 70 hours to kill.
Those breaches cost no victories, since two bosses are already down.
They are a calendar artifact, not a defense failure of the first two bosses.

**Breach recovery.** The 0.5% per hour auto-reconstruction takes 50.0 hours to rebuild a castle from 0% to the 25% threshold.
That is longer than the Sunday window in which most breaches start, so 808 of 996 breaches in the study were still open when the week reset.
Recovery therefore does not matter in practice at the default values. The recovery constants are also low-leverage for balance:
with the recommended change below, doubling auto-reconstruction (1%/h) or question repair (0.2%) leaves the breach rates unchanged.
Repair from correct answers during a breach averaged 0.0% of castle HP per breach week.
That is a feature of the timing, not of the constant, because the breaches land on Friday and Sunday.

## 3. Options tested

| Option | Outcome |
|---|---|
| Only change numbers (castle HP/student, boss attack, attack growth) | Either breaches stay frequent or the castle becomes so strong that donations stop mattering. No setting met all goals. |
| C1/C2 (stronger castle, slower attack growth) | Removed the donation stake at normal attendance. Rejected. |
| Faster auto-reconstruction or question repair alone | No effect on breach rates, as above. Rejected. |
| **Package P (below)** | Meets all seven acceptance criteria at 10 and 25 students and six of seven at 40. Keeps the donation stake. Holds up at 60% attendance. |

## 4. Package P (approved and applied)

Two changes, made in `DEFAULT_TUNING`:

1. `noSpawnWindowHours` 2 -> **30**. A new boss does not appear when 30 hours or fewer remain in the week.
   This reads the design's own wording in section 13.2 ("provided sufficient campaign time remains") as a longer cutoff than the 2-hour floor in section 11.2.
2. `bossAttackPerHourRef` 110 -> **120**. Slightly harder Boss 1, so the castle matters for the two bosses the class does fight.

Predicted results (25 students, 30 weeks, 6 cohorts):

| Donations | Bosses/week | Breach weeks | Median castle at end | Min castle p50 |
|---|---|---|---|---|
| low (5%) | 1.93 | 44% | 8% | 3% |
| mixed (15%) | 1.98 | 9% | 27% | 20% |
| moderate (26%) | 2.00 | 9% | 33% | 26% |
| high (42%) | 2.00 | 1% | 40% | 31% |

- **Victories:** 1-2 per week for 93-100% of weeks at every donation level. This matches the goal of 1-2 Normal victories.
- **Defense:** the castle stays meaningful. Low donations still breach in about half of weeks, and a moderate class ends the week at about a third of its HP.
- **Donations still matter:** the breach rate falls from 44% (low) to 9% (moderate) to 1% (high), and the median end-of-week castle rises from 8% to 40%.
- **Recovery:** breaches that do happen recover in 24 to 48 hours in most cases (137 of 207 in the study), so the recovery mechanic starts to be visible.
- **Attendance stress (60%):** 25 students at low / mixed / moderate / high donations win 1.08 / 1.71 / 1.96 / 1.97 bosses per week, with breaches in 94 / 29 / 4 / 3% of weeks.
  Weak classes struggle if nobody donates, as intended.
- **Class size:** breach-weeks differ by at most 6 points at moderate donations.

Side effects to accept knowingly:

- About 21 hours per week with no active boss (idle) at moderate donations, because the late-week Boss 3 no longer spawns. This is the cost of removing the Sunday breaches.
  If the owner wants something to do in that window, that is a feature decision, not a balance one.
- Boss 1 combat time (38.6h) is unchanged and above the 30h target. Raising class DPS is the lever, if the owner wants to hit 30h exactly.
- At 40 students with moderate donations the breach rate is 4%, just under the 5% floor of our own "occasional breaches" criterion. This is noise-level and not worth a separate tweak.
- `docs/GAME_DESIGN.md` carries short prototype notes next to the 2-hour cutoff and the 110 attack/hour; the rest of that document is unchanged.

## 5. Assumptions and caveats

- The simulator's bots donate only when the castle is below 60%, so "donation rate" is partly a function of castle state. Real classes may behave differently.
- Donation swing of +/-50% and 6 cohorts per cell are modeling choices. Results are stable across the 30 simulated weeks (section E of `study`) but are not real student data.
- The recovery constants (0.5%/h, 0.1% per answer) are placeholders in the design. The results above show they barely affect outcomes, so they can stay.
- The 30-hour spawn cutoff is an interpretation of section 13.2, not a confirmed rule.
- Real playtests should replace these bots before any number is treated as final.

## 6. What changed in code (no behavior change at defaults)

- Combat constants moved into a single mutable `TUNING` object with the design values as `DEFAULT_TUNING`. A before/after state fingerprint (4 scenarios) and all existing tests confirm identical behavior.
- `src/sim/*`: simulator, CLI, and 5 tests.
- Build fixes: `"types": ["node"]` in `tsconfig.json` (TypeScript 6 no longer auto-loads `@types`) and `src/globals.d.ts` for CSS imports.
- Two tests pin the default values and the spawn-cutoff knob.
- After approval: defaults changed to 30h / 120, and the tests that assumed 110/hour or a 2-hour cutoff were updated (53 tests pass).
