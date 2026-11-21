# MATH BOSS
## Master Game Design Document — Version 1.3

**Project:** Math Boss  
**Repository:** `Finch-Fun/Math-Boss`  
**Document location:** `docs/GAME_DESIGN.md`  
**Status:** Pre-development — Preparing Milestone 0  
**Initial audience:** Private school pilot  
**Long-term goal:** Free educational website available to teachers  
**Proposed technology:** React, TypeScript, Firebase  
**Platform:** Web browsers, school Chromebooks, desktop, and mobile

---

# 1. Game Overview

Math Boss is a cooperative, browser-based educational idle game where students answer math questions to earn coins, permanently improve their characters, and work together to defeat increasingly powerful monsters while protecting a shared classroom castle.

Each classroom functions as its own cooperative team.

Students contribute through two primary activities:

1. **Personal Progression:** Purchase permanent offensive upgrades that improve their character's automatic damage.
2. **Classroom Cooperation:** Donate coins toward shared upgrades that strengthen the classroom's offense and defense.

The boss attacks the classroom castle while activated students automatically attack the boss.

Students do not need to leave their browsers open to participate in combat.

The classroom attempts to defeat as many bosses as possible during a seven-day weekly campaign.

### Design Principles

- Math practice is the primary source of coins.
- Students should receive educational feedback when they make mistakes.
- Permanent upgrades provide meaningful long-term progression.
- Classroom teamwork should matter.
- Students must never lose permanent upgrades because of a weekly defeat.
- Participation should be rewarded without punishing students for absences.
- Teachers control assignments, difficulty, and classroom settings.
- Gameplay must remain understandable to elementary and middle school students.
- Technical systems should be efficient enough to target free or very low-cost hosting.
- Student learning records should remain private.

---

# 2. Accounts and Classrooms

## 2.1 Teacher Accounts

Teachers can create and manage multiple classrooms.

Each classroom independently maintains:

- Student roster
- Grade level
- Selected mathematical skills
- Daily Review settings
- Bonus Question assignments
- Question difficulty settings
- Student progress
- Weekly boss encounters
- Castle health and defenses
- Shared projects
- Battle statistics
- Leaderboard settings

Teachers should not have to manually operate weekly battles.

## 2.2 Student Accounts

Each student has one character with:

- Personal coin balance
- Permanent offensive upgrades
- Calculated Damage Per Second (DPS)
- Weekly activation status
- Learning history
- Weekly damage contribution
- Lifetime statistics

Personal progression persists between weeks.

For the pilot, student information should be minimized, and account access must comply with school and district requirements.

## 2.3 Classroom Membership

Students may participate only in classrooms to which they are authorized.

A teacher may add, remove, or transfer students.

A student cannot generate duplicate combat contributions by opening multiple browser tabs.

Student membership changes must not cause existing boss health to increase unexpectedly during an encounter.

## 2.4 Classroom Size

The game must support small and large classrooms.

Boss strength, castle health, and shared upgrade costs should account for the number of participating students.

The initial testing range is 1–40 students per classroom.

---

# 3. Daily Spiral Review

## 3.1 Teacher Configuration

Teachers choose the number of Daily Review questions.

**Allowed range: 0–20 questions per day.**

**Recommended default: 10 questions per day.**

Teachers can configure separate amounts for Monday through Friday.

For example:

| Day | Assigned Questions |
|---|---:|
| Monday | 10 |
| Tuesday | 10 |
| Wednesday | 10 |
| Thursday | 10 |
| Friday | 10 |
| Saturday | 0 |
| Sunday | 0 |

Saturday and Sunday contain no regularly scheduled review questions by default, although the weekly battle continues.

Teachers may adjust their classroom's question schedule.

Daily Review questions unlock on their assigned date.

Unfinished assignments remain available through the instructional week so students can catch up after absences.

Question attempts, corrections, and rewards must persist when students close or refresh the browser.

## 3.2 Teacher-Selected Skills

Teachers select which mathematical skills are included in Daily Review.

The built-in bank is organized by:

- Grade level
- Mathematical skill
- Difficulty
- Question type

Teachers enable previously taught skills and can introduce additional skills as the school year progresses.

The game generates mixed spiral review questions from the enabled skills.

## 3.3 Question Rotation

Question selection should incorporate:

- General mixed review
- Skills students have struggled with
- Recently enabled skills
- Avoidance of unnecessary repeated questions

Initial proposed distribution:

| Category | Approximate Share |
|---|---:|
| General spiral review | 50% |
| Skills needing reinforcement | 30% |
| Recently added skills | 20% |

These percentages are provisional targets across multiple assignments.

If the student lacks performance history, questions should be distributed across the available skills.

## 3.4 Difficulty Settings

Teachers control the distribution of Easy, Medium, and Hard questions.

| Preset | Easy | Medium | Hard |
|---|---:|---:|---:|
| Foundations | 70% | 25% | 5% |
| Balanced | 40% | 40% | 20% |
| Challenge | 20% | 40% | 40% |
| Custom | Teacher-defined | Teacher-defined | Teacher-defined |

Difficulty reflects mathematical complexity rather than simply larger numbers.

The difficulty level does not change the number of coins awarded.

---

# 4. Daily Question Attempts and Rewards

Students must correctly answer a Daily Review question before moving to the next question.

## 4.1 Rewards

| Result | Coins |
|---|---:|
| First attempt correct | 10 |
| Second attempt correct | 5 |
| Third or later attempt correct | 2 |

Incorrect responses do not deduct coins.

## 4.2 Correction System

**First incorrect attempt:** Display a basic hint.

**Second incorrect attempt:** Display a more detailed hint or explanation.

**Additional incorrect attempts:** Provide guided assistance and, where appropriate, a worked example using a similar problem.

The student must still answer the original question correctly before advancing.

Students who require multiple attempts can still complete their assignments and activate their characters.

## 4.3 Teacher Reporting

For each question, record:

- Skill
- Difficulty
- First-attempt correctness
- Number of attempts
- Final completion status
- Coins earned
- Completion date

First-attempt accuracy and eventual corrected completion must be reported separately.

---

# 5. Bonus Questions

Bonus Questions are separate from Daily Review.

They function as one-attempt mini-quizzes.

Possible future uses include:

- Word problems
- OST preparation
- Multi-step mathematical reasoning
- Teacher-created challenges

The initial interface simply labels the feature **Bonus Questions**.

## 5.1 Rules

- One submitted answer per question
- Correct answer earns 20 coins
- Incorrect answer earns 0 coins
- No retries after submission
- No hints before submission
- Answers become locked after submission
- Teachers choose question availability
- Explanations can appear after submission or after the assignment closes

Bonus Questions are separate from the 0–20 Daily Review limit.

Bonus Questions provide additional earning opportunities but must not be required for a normal classroom boss victory.

---

# 6. Question Bank

Math Boss supports two sources.

## 6.1 Built-In Questions

Questions organized by grade, skill, and difficulty.

Initial question formats:

- Multiple choice
- Numeric entry

The bank should use verified fixed questions and controlled mathematical templates that can generate new number variations.

Questions must have validated correct answers and appropriate explanations.

Do not generate unverified questions using live AI during the school pilot.

## 6.2 Teacher-Created Questions

Teachers can create their own questions.

Each custom question includes:

- Question text
- Answer choices or accepted numeric answer
- Correct answer
- Skill category
- Difficulty
- Optional explanation

Teachers can assign their questions to specific classrooms or use them within regular spiral review.

## 6.3 Initial Coverage

Do not attempt to complete every K–8 mathematical standard before the pilot.

Begin with the grade levels and skills used by participating teachers.

Additional skill banks can be added over time.

---

# 7. Coin Economy

Coins are the only currency.

Students earn coins from math questions.

Students spend coins on:

1. Permanent character upgrades
2. Donations to classroom projects

## 7.1 Coin Persistence

Coins do not reset weekly.

Students keep their unspent coins throughout their enrollment.

Coins are deducted only through valid purchases or donations.

The system must prevent negative balances, duplicate rewards, and unauthorized balance changes.

## 7.2 Example Daily Earnings

With ten Daily Review questions:

- Maximum daily earnings: 100 coins
- Maximum five-day regular earnings: 500 coins

Bonus Question rewards are additional.

## 7.3 Economic Philosophy

Personal progression should remain rewarding, but classroom donations should provide attractive alternatives to spending every coin on individual upgrades.

Students must never be required to donate a fixed percentage of their earnings.

---

# 8. Permanent Character Upgrades

Students begin with a basic character.

Initial statistics:

- Base damage: 1
- Attacks per second: 1
- Critical chance: 5%
- Critical multiplier: 1.5×

There are four offensive upgrades.

| Upgrade | Starting Cost | Benefit | Price Growth |
|---|---:|---|---:|
| Attack Damage | 10 | +1 damage | 15% |
| Attack Speed | 25 | +5% of base attack speed | 18% |
| Critical Chance | 40 | +1 percentage point | 20% |
| Critical Damage | 50 | +0.10 critical multiplier | 18% |

**All costs and effects are provisional until balance testing is approved.**

## 8.1 Upgrade Cost Formula

Starting formula:

`Next Cost = ceil(Base Cost × Growth Factor ^ Current Level)`

Upgrade costs are always whole coins.

## 8.2 Damage Calculation

Expected damage per second:

`DPS = Damage × Attacks Per Second × [1 + Crit Chance × (Crit Multiplier − 1)]`

This uses expected critical damage rather than generating individual random attacks on the server.

## 8.3 Proposed Caps

- Critical Chance: 40%
- Attack Speed: additive growth, not unlimited compound growth
- Critical Damage: diminishing returns or a cap to be established during testing
- Attack Damage: no initial hard level cap

The simulation must identify whether one upgrade becomes overwhelmingly more efficient than the others.

## 8.4 Permanent Progression

Upgrades do not reset weekly.

A student who participates for 30 weeks retains all previously purchased offensive improvements.

Boss difficulty must scale as the classroom grows stronger.

---

# 9. Upgrade Subtraction

Teachers can enable or disable subtraction during personal upgrade purchases.

**Classroom setting: Require Math for Upgrades — ON/OFF**

When enabled, a student must calculate the remaining coin balance before completing a purchase.

Example:

350 coins − 125 coins = 225 coins.

The student enters the remaining balance.

Correct entry completes the purchase.

Incorrect entry produces a hint and allows another attempt.

No additional coins are earned from these calculations.

The system validates the actual balance and purchase price independently of the student's input.

When disabled, the purchase completes normally.

---

# 10. Weekly Attack Activation

**Confirmed rule: Weekly activation is required.**

At the beginning of each weekly campaign, students are inactive.

Inactive students retain their upgrades but contribute no offensive damage.

Completing one Daily Review question correctly activates the character for the remainder of the week.

After activation:

- Attacks continue automatically while combat is active.
- The browser may be closed.
- Training periods pause attacks.
- Castle breaches pause attacks.
- Boss transitions do not reset activation.
- No additional activation is required until the next Monday.

Activation begins when the qualifying answer is validated.

Previous inactive time never produces retroactive damage.

## 10.1 Zero-Question Week Exception

**Confirmed rule:** If the teacher assigns zero Daily Review questions for the entire instructional week, all eligible enrolled students automatically activate.

This exception must not depend on Bonus Question performance.

Zero-question weeks should be excluded from competitive school rankings unless administrators establish compatible participation rules.

## 10.2 Partially Zero-Question Weeks

If a teacher assigns questions later in the week but none are available on Monday, weekly activation remains tied to the first available Daily Review.

The precise rule for whether an unopposed boss may attack before the first assignment unlocks remains a balancing and implementation decision.

The preferred safeguard is to prevent the class from taking unavoidable damage before any normal activation opportunity.

## 10.3 Teacher Override

A teacher-only activation override may be provided for unusual situations.

Any override must be logged and must not alter permanent student progression.

---

# 11. Weekly Battle Schedule

**Confirmed schedule:**

Monday at 12:00 AM through the following Monday at 12:00 AM, exclusive.

This is a complete seven-day campaign.

Battle calculations continue overnight and through weekends.

Each classroom has a configured timezone.

All weekly boundaries should use timezone-aware calculations, including daylight saving time changes.

## 11.1 Weekly Campaign Start

At the beginning of the week:

- Reset weekly activation.
- Reset castle health.
- Reset weekly shared upgrades and project funding.
- Reset weekly damage totals.
- Reset weekly boss count.
- Generate Boss 1.
- Preserve every student's coins and permanent upgrades.

## 11.2 Weekly Campaign End

At the end of Sunday:

- Stop combat.
- Finalize weekly achievements.
- Record bosses defeated.
- Record castle health.
- Record classroom contribution statistics.
- Preserve historical records.

The next campaign begins on Monday.

No new boss should spawn within the final two hours of a campaign.

---

# 12. Automatic Boss Combat

Each classroom has one boss encounter at a time.

Active students contribute DPS toward the shared boss.

The boss automatically attacks the classroom castle.

Individual attacks can be animated on screen, but combat calculations must remain server-authoritative and efficient.

## 12.1 Offline Combat

Damage is calculated using:

- Validated player DPS
- Time spent active
- Combat state
- Permanent upgrades
- Shared offensive bonuses
- Upgrade purchase timestamps

The system should not require a database write for every individual attack.

## 12.2 Boss HP Scaling

Boss 1 should account for:

- Expected participating student count
- Combined effective student DPS
- Permanent upgrade strength
- Recent participation
- Expected upgrade progression during the week
- Teacher-selected difficulty

Initial proposed formula:

`Boss 1 HP = Expected Class DPS × Target Combat Seconds × Difficulty Modifier`

Initial Normal difficulty target: approximately 30 active combat hours.

| Difficulty | Proposed Modifier |
|---|---:|
| Easy | 0.75× |
| Normal | 1.00× |
| Hard | 1.30× |

Boss HP becomes fixed when the encounter begins.

The game must not continuously increase boss HP whenever a student buys an upgrade.

## 12.3 Class Size Scaling

A classroom with 10 students should have a comparable chance of victory to a classroom with 30 students under similar participation conditions.

Scaling must use expected effective contributions rather than simply assigning a fixed identical health pool to every classroom.

---

# 13. Multi-Boss Campaign

After defeating Boss 1, the classroom progresses toward Boss 2.

Every subsequent boss is stronger.

Proposed progression:

| Boss | HP Multiplier | Attack Multiplier |
|---|---:|---:|
| Boss 1 | 1.00× | 1.00× |
| Boss 2 | 1.50× | 1.20× |
| Boss 3 | 2.25× | 1.44× |
| Boss 4 | 3.375× | 1.728× |
| Boss 5 | 5.0625× | 2.0736× |

Additional bosses may continue the same progression.

These multipliers are provisional.

## 13.1 Boss Defeat

When boss HP reaches zero while the castle is operational:

1. Record a successful boss defeat.
2. Stop all combat.
3. Preserve remaining castle health.
4. Begin a 24-hour training period.
5. Prepare the next boss stage.

## 13.2 Training Period

**Confirmed duration: 24 real-world hours.**

During training:

- Student attacks pause.
- Boss attacks pause.
- Students continue math practice.
- Students earn coins.
- Permanent personal upgrades can be purchased.
- Shared project donations remain available.
- Castle repairs remain available.

The next boss appears automatically when training ends, provided sufficient campaign time remains.

Training timers continue overnight and through weekends.

## 13.3 Weekly Victory

Defeating at least one boss during the week while satisfying castle survival requirements counts as a successful campaign.

Additional bosses defeated represent further achievements.

There is no Endless Titan in Version 1.

---

# 14. Classroom Castle

Each classroom has one shared castle.

Castle statistics:

- Maximum HP
- Current HP
- Armor
- Weekly offensive bonuses
- Weekly defensive bonuses
- Incoming boss attack timer

## 14.1 Castle Health Scaling

Provisional formula:

`Castle Maximum HP = 400 × Expected Participating Students`

Example:

25 students = 10,000 HP.

## 14.2 Boss Attacks

Bosses attack the castle at regular intervals.

Initial proposal: one attack per hour.

Example for a 25-student classroom:

- Boss 1: 110 damage per hour
- Boss 2: 132 damage per hour

Incoming damage increases with subsequent bosses.

Armor reduces incoming damage.

Castle damage persists between bosses within the same week.

## 14.3 Battle Strategy

Students must decide whether to invest in:

- More personal damage
- Increased class damage
- Improved castle armor
- Greater castle health
- Castle repairs

The goal is to create meaningful offensive and defensive choices without forcing a complicated resource management system.

---

# 15. Castle Breach and Recovery

**Confirmed rule: Recoverable breach.**

When castle HP reaches zero:

- Enter Breach State.
- Student offensive attacks pause.
- Permanent upgrades remain intact.
- Students retain unspent coins.
- Math practice continues.
- Donation projects remain accessible.
- Emergency reconstruction becomes available.

## 15.1 Recovery Requirement

The castle must recover to 25% of maximum health before combat resumes.

Recovery sources:

1. Funded castle repair projects
2. Additional emergency repair progress from completed math questions
3. Slow automatic emergency reconstruction

No classroom should remain permanently stuck because students have insufficient coins.

## 15.2 Recovery Constraints

- Emergency reconstruction must not award coins.
- The same question cannot be repeatedly exploited for unlimited repairs.
- Repairs cannot increase castle health beyond its maximum.
- Combat resumes automatically when the recovery threshold is reached.

Exact emergency reconstruction values will be determined during balance testing.

---

# 16. Shared Classroom Projects

Students can donate coins directly to individual shared projects.

Each project has a funding goal.

Students choose how much to contribute.

When the goal is reached, the project activates automatically.

**Confirmed: No voting system is required.**

## 16.1 Project Types

Initial proposed values for a 25-student classroom:

| Project | Starting Cost | Benefit |
|---|---:|---|
| Reinforce Walls | 400 | +10% castle maximum HP |
| Iron Plating | 450 | +5 percentage points armor |
| Battle Banner | 500 | +5% class DPS |
| Castle Repairs | 250 | Restore 20% maximum castle HP |

All values are provisional.

## 16.2 Project Rules

- Contributions are voluntary.
- Several students may fund the same project.
- Donations immediately deduct personal coins.
- Funding progress is shared.
- Projects activate automatically upon full funding.
- Excess contributions must not be charged.
- Donations cannot be withdrawn.
- Repairs are repeatable.
- Repeat purchases become more expensive.
- Weekly improvements reset every Monday.

## 16.3 Upgrade Limits

Proposed armor cap: 50%.

Battle Banner stacking must have an effective limit or diminishing returns.

Walls and repair projects must be balanced so the castle cannot become permanently invulnerable.

## 16.4 Shared Project Cost Scaling

Project prices should consider:

- Expected participating students
- Assigned Daily Review question counts
- Expected weekly coin earnings

A smaller classroom should not face the same donation requirements as a larger classroom.

---

# 17. Weekly Resets and Permanent Progression

## 17.1 Resets Weekly

- Castle current and maximum HP
- Weekly castle improvements
- Shared project funding
- Current boss number
- Boss health
- Weekly activation status
- Weekly damage totals
- Weekly classroom statistics

## 17.2 Never Resets Weekly

- Personal coins
- Personal offensive upgrades
- Permanent character progression
- Completed question history
- Mathematical skill accuracy history
- Lifetime classroom records
- Previously earned achievements

Permanent upgrades should continue feeling valuable throughout the school year.

---

# 18. Teacher Battle Report

Teachers can display a Battle Report on a classroom projector or interactive board.

This is an optional, teacher-controlled presentation feature.

## 18.1 Classroom Battle Report

Displays:

- Bosses defeated this week
- Current boss number and name
- Percentage of the current boss defeated
- Boss HP remaining
- Castle health
- Class DPS
- Number of students activated
- Coins donated
- Questions completed
- Current battle state
- Next boss attack or training countdown

## 18.2 Daily Change Summary

The report should show changes since the previous day or selected reporting period.

Examples:

- Boss damage increased by 18 percentage points
- Castle health improved by 12 percentage points
- 340 coins donated
- 46 math questions completed

This makes the report useful at the beginning or end of the school day.

## 18.3 School Leaderboards

Participating classrooms may opt into friendly school-wide competition.

Primary ranking:

1. Bosses defeated during the current week
2. Percentage of current boss defeated
3. Time-based tiebreaker when necessary

Training periods and castle breaches must be clearly indicated.

Classrooms with different workloads or difficulty settings may need separate divisions or comparison restrictions.

Zero-question weeks are excluded from competitive rankings by default.

## 18.4 Individual Recognition

Optional categories include:

- Heavy Hitter — Weekly offensive contribution
- Top Defender — Coins donated
- Castle Hero — Emergency repair contribution
- Math Champion — Daily Reviews completed
- Most Improved — First-attempt accuracy improvement, subject to sufficient data

These categories should celebrate student effort and cooperation without publicly exposing poor academic performance.

## 18.5 Student Privacy

Publicly presented reports should not expose:

- Individual grades
- Sensitive student records
- Individual accuracy percentages
- Student email addresses
- Private teacher notes

Approved nicknames or character names may be shown if permitted by school policy.

Student names should be hidden by default.

## 18.6 Presentation Mode

The teacher dashboard contains a **Present Battle Report** action.

The presentation should use:

- Large text
- Clear boss and castle health bars
- Easy-to-read classroom rankings
- Minimal controls
- Full-screen-friendly layout

Teachers can open it whenever they choose.

No automatic broadcast or scheduled presentation system is required for Version 1.

---

# 19. Teacher Dashboard

Teachers should be able to operate Math Boss without technical knowledge.

## Educational Controls

- Set classroom grade level
- Select mathematical skills
- Configure 0–20 daily questions
- Adjust weekday schedules
- Set question difficulty mix
- Create custom questions
- Assign Bonus Questions
- Review skill performance

## Game Controls

- Set boss difficulty
- Enable or disable purchase subtraction
- View castle health
- View shared projects
- View weekly boss progress
- Manage exceptional activation situations

## Reporting

- Daily assignment completion
- First-attempt accuracy
- Number of attempts
- Skill-specific performance
- Bonus Question results
- Classroom participation
- Battle Reports
- School leaderboard visibility

---

# 20. Student Interface

The student home screen should prioritize:

1. Current boss
2. Boss health
3. Classroom castle
4. Castle health
5. Current attack or training countdown
6. Personal coins
7. Personal DPS
8. Daily Review
9. Bonus Questions
10. Personal upgrades
11. Shared classroom projects

The UI should feel like a simple, approachable fantasy idle game.

Avoid unnecessarily complicated menus, inventories, character classes, and extensive text explanations.

It should function well on school Chromebooks and smaller mobile screens.

---

# 21. Technical Architecture

Proposed stack:

- React
- TypeScript
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- An authoritative backend for reward and combat operations

The exact backend architecture must be evaluated before implementation.

## 21.1 Authoritative Game State

The system, not the browser, determines:

- Coin rewards
- Correct-answer validation
- Upgrade purchases
- Donation transactions
- Student DPS
- Boss health
- Castle health
- Weekly activation
- Battle results

## 21.2 Offline Progress

Combat must function without students remaining online.

Use server-recorded timestamps and event-based calculations.

Do not continuously write every individual attack to the database.

## 21.3 Transaction Safety

The system must prevent:

- Duplicate coin rewards
- Duplicate upgrade purchases
- Negative coin balances
- Multiple completion of the same funded project
- Exploiting browser refreshes
- Unauthorized damage modification
- Cross-classroom access to private information

## 21.4 Free Hosting Goal

The initial goal is to operate the school pilot without monthly hosting costs.

This is a goal rather than a guarantee.

Firebase free-tier limitations, server-authoritative operations, and scheduled processing requirements must be verified before selecting the final deployment approach.

No paid infrastructure should be activated without explicit approval.

---

# 22. Game Balance Targets

These are **provisional targets**, not permanently approved values.

| System | Starting Target |
|---|---|
| Daily questions | 0–20 |
| Recommended default | 10 |
| Daily question rewards | 10 / 5 / 2 |
| Bonus correct answer | 20 |
| Bonus incorrect answer | 0 |
| Base damage | 1 |
| Base attack speed | 1 attack/sec |
| Base crit chance | 5% |
| Base crit multiplier | 1.5× |
| Boss 1 target duration | 30 active combat hours |
| Boss HP increase | 1.5× per stage |
| Boss attack increase | 1.2× per stage |
| Boss training period | 24 hours |
| Castle HP | 400 per expected participant |
| Initial castle attack | 110 HP/hour for 25 students |
| Castle breach recovery | 25% HP |
| Proposed armor cap | 50% |
| Suggested shared spending | 25–30% of class earnings |
| Campaign duration | Seven days |
| Personal upgrades | Permanent |
| Shared upgrades | Weekly reset |

The balance engine must test these values under diverse student behaviors.

Do not automatically change confirmed game mechanics based on simulation results.

---

# 23. Required Balance Simulation

Before the website is built, create a deterministic, reproducible mathematical simulation.

## 23.1 Test Class Sizes

- 1 student
- 10 students
- 25 students
- 40 students

## 23.2 Test Daily Question Counts

- 0
- 5
- 8
- 10
- 20

## 23.3 Test Participation

- 25%
- 50%
- 75%
- 100%

Include different weekly activation times.

## 23.4 Test Time Periods

- Week 1
- Week 4
- Week 12
- Week 20
- Week 30

## 23.5 Test Student Spending Strategies

- Balanced upgrading
- Attack Damage focus
- Critical Chance and Critical Damage focus
- Saving coins
- Heavy classroom donations
- Minimal classroom donations

## 23.6 Required Simulation Outputs

- Average student DPS
- Total class DPS
- Coins earned
- Coins saved
- Coins donated
- Upgrade levels purchased
- Average boss defeat time
- Bosses defeated each week
- Castle breaches
- Emergency reconstruction frequency
- Castle health at weekly reset
- Classroom size fairness
- Upgrade efficiency
- Long-term progression stability

Simulation reports must distinguish assumptions from verified outcomes.

---

# 24. Development Milestones

## Milestone 0 — Simulation and Balance

Build the mathematical simulation without Firebase or a website.

Produce automated tests and balance reports.

Identify problems and recommend changes for review.

## Milestone 1 — Educational Foundation

Build:

- Teacher accounts
- Classrooms
- Student access
- Question bank
- Teacher-created questions
- Daily Review
- Bonus Questions
- Coin rewards

## Milestone 2 — Permanent Character Progression

Build:

- Permanent coins
- Four offensive upgrades
- Purchase subtraction
- DPS calculations
- Weekly activation

## Milestone 3 — Cooperative Combat

Build:

- Scaled weekly bosses
- Automatic offline combat
- Seven-day campaigns
- Multi-boss progression
- 24-hour training periods
- Castle health
- Boss attacks

## Milestone 4 — Castle Defense and Shared Economy

Build:

- Donation projects
- Weekly buffs
- Repairs
- Castle breaches
- Emergency reconstruction
- Weekly reset rules

## Milestone 5 — Teacher Reporting and Battle Reports

Build:

- Skill accuracy reports
- Assignment progress
- Classroom Battle Report
- Presentation mode
- Optional school rankings

## Milestone 6 — School Pilot

Validate:

- Student access security
- District privacy requirements
- Chromebook compatibility
- Database usage and operating costs
- Backend correctness
- Anti-exploit protections
- Load performance
- Long-term game balance

Deploy only after explicit authorization and necessary school approvals.

---

# 25. Deliberately Deferred Features

The initial pilot will not include:

- Character classes
- Equipment
- Inventories
- PvP
- Student trading
- Chat
- Student voting
- Prestige resets
- Multiple currencies
- Elaborate combat animations
- AI-generated live questions
- Advanced automatic adaptive learning
- Public national leaderboards
- Cosmetic marketplaces

These features should not be added unless specifically approved.

---

# 26. Outstanding Implementation Decisions

The following details require technical planning or simulation before they are finalized:

1. Exact initial question bank coverage by grade.
2. Detailed question template validation and answer equivalence.
3. Student account authentication and district privacy approval.
4. Precise participation estimation for boss calibration.
5. Castle behavior before the first Daily Review unlocks.
6. Exact emergency repair rates.
7. Long-term Attack Speed and Critical Damage limits.
8. Shared project repeat-cost growth.
9. Boss scaling adjustments for uneven activation times.
10. Classroom comparison rules for school leaderboards.
11. Hosting architecture and operational cost verification.
12. Handling student transfers between classrooms.
13. Timezone and daylight saving edge cases.
14. Deterministic resolution of simultaneous purchases, donations, attacks, and boss defeats.

These should be documented and resolved before production deployment.

---

# 27. Development Governance

Math Boss must be built in small, reviewable milestones.

Claude Code or another coding agent should:

- Read this design document before implementation.
- Treat confirmed gameplay rules as authoritative.
- Separate approved mechanics from provisional balancing values.
- Use development branches and pull requests.
- Run automated tests where possible.
- Explain balance or architecture concerns.
- Avoid silently changing game rules.
- Avoid introducing unapproved features.
- Never deploy or activate paid infrastructure without authorization.
- Never modify unrelated projects or repositories.

The owner reviews and approves significant game design and balance changes.

---

# 28. Project Success Criteria

Math Boss is successful if:

- Students regularly complete math review because the game provides motivation.
- Students can correct mistakes and learn from feedback.
- Teachers can configure assignments with minimal effort.
- Character progression remains rewarding throughout a school year.
- Classrooms make meaningful cooperative spending decisions.
- Castle defense matters without becoming excessively punitive.
- Bosses scale effectively across classroom sizes.
- Teachers can display engaging classroom progress reports.
- School competition is friendly and appropriately comparable.
- Student information remains protected.
- The platform can operate affordably at school scale.

## Final Vision

**Math Boss turns everyday math practice into a cooperative classroom adventure.**

Students improve their characters through learning, contribute to collective victories, make strategic decisions about shared resources, and return each week to face new challenges.

The game should remain educational first, cooperative second, and mechanically simple enough to be enjoyable without overwhelming teachers or students.

---

**End of Math Boss Master Game Design Document — Version 1.3**

**Next Development Phase: Milestone 0 — Mathematical Balance Simulation**
