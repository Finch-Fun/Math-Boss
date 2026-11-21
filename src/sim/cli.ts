// Balance study CLI. Every command accepts --tuning '<json>' to override provisional values for that run only.
//   npm run balance -- study [--weeks 12] [--seeds 5] [--engagement 1]
//   npm run balance -- curve [--students 25] [--weeks 12] [--seeds 5]        (breach/castle vs donation rate)
//   npm run balance -- sweep --grid '{"castleHpPerStudent":[400,500],"bossAttackPerHourRef":[110,90]}' [--weeks 8] [--seeds 3]
import { DEFAULT_TUNING, HOUR, resetTuning, setTuning, TUNING, type Tuning } from '../game/constants';
import { devSetCastleFraction } from '../game/dev';
import { advance } from '../game/engine';
import { createGame } from '../game/sample';
import { PHASES, runCohorts, summarize, type Summary, type WeekResult } from './balanceSim';

const SIZES = [10, 25, 40];
const DONATIONS = [
  { label: 'low', pct: 0.05 },
  { label: 'mixed', pct: 0.15 }, // about what the sample classroom's mix of habits donates
  { label: 'moderate', pct: 0.25 }, // low end of the design's suggested 25-30% shared spending
  { label: 'high', pct: 0.4 },
];

const argv = process.argv.slice(2);
const command = argv[0] ?? 'study';
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const tuningArg = (): Partial<Tuning> => JSON.parse(arg('tuning', '{}')) as Partial<Tuning>;
const engagement = (): number => Number(arg('engagement', '1'));
const spread = (): number => Number(arg('spread', '0.5')); // weekly donation swing; 0 = deterministic
const pc = (x: number): string => (Number.isNaN(x) ? '  - ' : `${(x * 100).toFixed(0)}%`.padStart(4));
const h1 = (x: number): string => (Number.isNaN(x) ? '  - ' : x.toFixed(1).padStart(5));
const cell = (s: string | number, w: number): string => String(s).padEnd(w);

function describeTuning(t: Partial<Tuning>): string {
  const diff = Object.entries(t).filter(([k, v]) => JSON.stringify(DEFAULT_TUNING[k as keyof Tuning]) !== JSON.stringify(v));
  return diff.length ? diff.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : 'provisional defaults (docs/GAME_DESIGN.md)';
}

/** Acceptance criteria used in docs/BALANCE_REPORT.md. `by` maps donation label -> summary for one class size. */
export const CRITERIA_COUNT = 7;
export function criteria(by: Record<string, Summary>): { name: string; ok: boolean }[] {
  const { low, mixed, moderate, high } = by;
  const victories = (s: Summary) => s.bossDist.one + s.bossDist.two;
  return [
    { name: '1-2 victories in >=85% of weeks (mixed and moderate donations)', ok: victories(mixed) >= 0.85 && victories(moderate) >= 0.85 },
    { name: '>=1 victory in >=95% of weeks at every donation level', ok: [low, mixed, moderate, high].every((s) => 1 - s.bossDist.zero >= 0.95) },
    { name: 'moderate (25%) donations: breach in 5-25% of weeks', ok: moderate.breachWeekShare >= 0.05 && moderate.breachWeekShare <= 0.25 },
    { name: 'mixed (15%) donations: breach in <=40% of weeks', ok: mixed.breachWeekShare <= 0.4 },
    { name: 'donations matter: low (5%) breach rate >= moderate + 30 pts', ok: low.breachWeekShare >= moderate.breachWeekShare + 0.3 },
    { name: 'defense stays meaningful: high (40%) donations breach <=5% but castle still dips below 75%', ok: high.breachWeekShare <= 0.05 && high.castleMinMean <= 0.75 },
    { name: 'moderate median castle HP at week end is 20-60%', ok: moderate.castleEnd.p50 >= 0.2 && moderate.castleEnd.p50 <= 0.6 },
  ];
}

function study(): void {
  const weeks = Number(arg('weeks', '12'));
  const seeds = Number(arg('seeds', '5'));
  const tuning = tuningArg();
  const engagementScale = engagement();
  console.log(`BALANCE STUDY  weeks=${weeks} cohorts=${seeds} per cell  attendance x${engagementScale}  donation swing +/-${spread() * 100}%  tuning: ${describeTuning(tuning)}\n`);

  const data = new Map<string, WeekResult[]>();
  for (const size of SIZES) {
    for (const d of DONATIONS) data.set(`${size}|${d.label}`, runCohorts({ students: size, donatePct: d.pct, weeks, tuning, engagementScale, donationSpread: spread() }, seeds));
  }
  const sum = (size: number, label: string): Summary => summarize(data.get(`${size}|${label}`)!);

  console.log('A. CASTLE SURVIVAL BY CLASS SIZE AND DONATION RATE (every cohort-week)');
  console.log(
    [cell('size', 5), cell('donate', 10), cell('paid', 5), cell('bosses', 7), cell('0/1/2/3+ wins', 18), cell('breach', 7), cell('costly', 7), cell('in breach@end', 14), cell('castle end p10/p50/p90', 22), cell('min HP', 7), cell('breach h/wk', 12), 'recovery h'].join(''),
  );
  for (const size of SIZES) {
    for (const d of DONATIONS) {
      const s = sum(size, d.label);
      console.log(
        [
          cell(size, 5),
          cell(d.label, 10),
          cell(pc(s.donationShare), 5),
          cell(s.bossesMean.toFixed(2), 7),
          cell(`${pc(s.bossDist.zero)} ${pc(s.bossDist.one)} ${pc(s.bossDist.two)} ${pc(s.bossDist.threePlus)}`, 18),
          cell(pc(s.breachWeekShare), 7),
          cell(pc(s.costlyBreachShare), 7),
          cell(pc(s.endedInBreachShare), 14),
          cell(`${pc(s.castleEnd.p10)} ${pc(s.castleEnd.p50)} ${pc(s.castleEnd.p90)}`, 22),
          cell(pc(s.castleMinMean), 7),
          cell(h1(s.hours.breach), 12),
          s.recovery.n ? `${h1(s.recovery.mean)} (n=${s.recovery.n})` : '-',
        ].join(''),
      );
    }
  }
  console.log('   breach = week had >=1 breach; costly = a breach began before the final victory (or the class never won); recovery = completed breaches only');
  console.log('\n   Fairness across class sizes (max - min):');
  for (const d of DONATIONS) {
    const all = SIZES.map((z) => sum(z, d.label));
    const spread = (f: (s: Summary) => number) => Math.round((Math.max(...all.map(f)) - Math.min(...all.map(f))) * 100);
    console.log(`   ${cell(d.label, 9)} breach weeks ${spread((s) => s.breachWeekShare)} pts | castle median ${spread((s) => s.castleEnd.p50)} pts | bosses ${(Math.max(...all.map((s) => s.bossesMean)) - Math.min(...all.map((s) => s.bossesMean))).toFixed(2)}`);
  }

  console.log('\nB. WHERE THE WEEK GOES: hours per week by phase, and each boss (moderate donations)');
  console.log([cell('size', 6), ...PHASES.map((p) => cell(p, 10)), cell('B1 combat / falls at', 22), cell('B2 combat / falls at', 22), cell('B3 combat', 10)].join(''));
  for (const size of SIZES) {
    const s = sum(size, 'moderate');
    console.log(
      [
        cell(size, 6),
        ...PHASES.map((p) => cell(h1(s.hours[p]), 10)),
        cell(`${h1(s.bossCombatHours[0])}h / hr ${h1(s.bossDefeatHour[0])}`, 22),
        cell(`${h1(s.bossCombatHours[1])}h / hr ${h1(s.bossDefeatHour[1])}`, 22),
        cell(`${h1(s.bossCombatHours[2])}h`, 10),
      ].join(''),
    );
  }
  console.log('   combat = boss attacking; waiting = Monday before the first student activates; training = 24h after each victory. Boss 1 target: 30 combat hours.');

  console.log('\n   Typical week, 25 students: mean castle HP at the end of each day (Mon..Sun)');
  for (const d of DONATIONS) console.log(`   ${cell(d.label, 9)} ` + sum(25, d.label).castleByDay.map(pc).join(' '));

  console.log('\nC. BREACH TIMING AND RECOVERY (all cells)');
  const all = [...data.values()].flat();
  const starts = all.flatMap((r) => r.breachStartHours);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  console.log(`   ${starts.length} breaches began on:  ` + days.map((d, i) => `${d} ${starts.filter((h) => Math.floor(h / 24) === i).length}`).join('  '));
  const recoveries = all.flatMap((r) => r.breachRecoveryHours);
  const buckets: [string, (x: number) => boolean][] = [
    ['<12h', (x) => x < 12],
    ['12-24h', (x) => x >= 12 && x < 24],
    ['24-48h', (x) => x >= 24 && x < 48],
    ['>=48h', (x) => x >= 48],
  ];
  console.log(`   ${recoveries.length} breaches recovered before the week ended:  ` + buckets.map(([l, f]) => `${l}: ${recoveries.filter(f).length}`).join('  ') + `   |   ${all.filter((r) => r.breachOpenAtEnd).length} weeks ended still in breach`);
  const fromQuestions = all.filter((r) => r.breaches > 0).map((r) => r.questionRepairPct);
  console.log(`   Repair from correct answers during breaches: mean ${(100 * (fromQuestions.reduce((a, b) => a + b, 0) / Math.max(1, fromQuestions.length))).toFixed(1)}% of castle HP per breach week`);
  const auto = isolatedRecovery();
  console.log(`   Isolated check (nobody answering): ${auto.toFixed(1)}h to rebuild 0% -> ${TUNING.breachRecoveryFraction * 100}% at ${(TUNING.autoReconstructionPerHour * 100).toFixed(2)}%/hour (formula ${(TUNING.breachRecoveryFraction / TUNING.autoReconstructionPerHour).toFixed(1)}h)`);

  console.log('\nD. ACCEPTANCE CRITERIA');
  for (const size of SIZES) {
    const by = Object.fromEntries(DONATIONS.map((d) => [d.label, sum(size, d.label)]));
    const results = criteria(by);
    console.log(`   ${size} students: ${results.filter((r) => r.ok).length}/${CRITERIA_COUNT}   failing: ${results.filter((r) => !r.ok).map((r) => r.name).join(' | ') || 'none'}`);
  }

  if (weeks >= 30) {
    console.log('\nE. LONG-TERM STABILITY (25 students): bosses / breach weeks / castle median');
    console.log([cell('week', 6), ...DONATIONS.map((d) => cell(d.label, 24))].join(''));
    for (const wk of [1, 4, 12, 20, 30]) {
      const cells = DONATIONS.map((d) => {
        const s = summarize(data.get(`25|${d.label}`)!.filter((r) => r.week === wk));
        return cell(`${s.bossesMean.toFixed(2)} / ${pc(s.breachWeekShare)} / ${pc(s.castleEnd.p50)}`, 24);
      });
      console.log([cell(wk, 6), ...cells].join(''));
    }
  }
}

/** Hours for the castle to rebuild from 0 to the recovery threshold with nobody answering questions. */
function isolatedRecovery(): number {
  resetTuning();
  setTuning(tuningArg());
  try {
    const s = createGame({ now: new Date(2026, 0, 5, 0).getTime(), studentCount: 25, botsEnabled: false });
    devSetCastleFraction(s, 0);
    s.battle.phase = 'breach';
    s.battle.nextAttackAt = null;
    const t0 = s.now;
    for (let i = 0; i < 200 * 60 && s.battle.phase === 'breach'; i++) advance(s, s.now + 60_000);
    return (s.now - t0) / HOUR;
  } finally {
    resetTuning();
  }
}

function curve(): void {
  const weeks = Number(arg('weeks', '12'));
  const seeds = Number(arg('seeds', '5'));
  const students = Number(arg('students', '25'));
  const tuning = tuningArg();
  console.log(`DONATION RESPONSE  ${students} students, ${weeks} weeks x ${seeds} cohorts  attendance x${engagement()}  donation swing +/-${spread() * 100}%  tuning: ${describeTuning(tuning)}\n`);
  console.log([cell('donate', 8), cell('paid', 6), cell('bosses', 8), cell('1-2 wins', 9), cell('breach', 8), cell('costly', 8), cell('in breach@end', 14), cell('castle end p50', 15), cell('min HP', 7)].join(''));
  for (const pct of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    const s = summarize(runCohorts({ students, donatePct: pct, weeks, tuning, engagementScale: engagement(), donationSpread: spread() }, seeds));
    console.log([cell(pc(pct), 8), cell(pc(s.donationShare), 6), cell(s.bossesMean.toFixed(2), 8), cell(pc(s.bossDist.one + s.bossDist.two), 9), cell(pc(s.breachWeekShare), 8), cell(pc(s.costlyBreachShare), 8), cell(pc(s.endedInBreachShare), 14), cell(pc(s.castleEnd.p50), 15), pc(s.castleMinMean)].join(''));
  }
}

function sweep(): void {
  const weeks = Number(arg('weeks', '8'));
  const seeds = Number(arg('seeds', '3'));
  const students = Number(arg('students', '25'));
  const grid = JSON.parse(arg('grid', '{}')) as Record<string, unknown[]>;
  let combos: Partial<Tuning>[] = [{}];
  for (const key of Object.keys(grid)) combos = combos.flatMap((c) => grid[key].map((v) => ({ ...c, [key]: v })));
  console.log(`SWEEP  ${students} students, ${weeks} weeks x ${seeds} cohorts. Per donation level: bosses | breach weeks | castle median at week end\n`);
  console.log([cell('tuning', 58), ...DONATIONS.map((d) => cell(`${d.label} ${pc(d.pct).trim()}`, 21)), 'score'].join(''));
  for (const tuning of combos) {
    const by = Object.fromEntries(DONATIONS.map((d) => [d.label, summarize(runCohorts({ students, donatePct: d.pct, weeks, tuning, engagementScale: engagement(), donationSpread: spread() }, seeds))]));
    const ok = criteria(by).filter((c) => c.ok).length;
    const cells = DONATIONS.map((d) => {
      const s = by[d.label];
      return cell(`${s.bossesMean.toFixed(1)} | ${pc(s.breachWeekShare)} | ${pc(s.castleEnd.p50)}`, 21);
    });
    console.log([cell(describeTuning(tuning), 58), ...cells, `${ok}/${CRITERIA_COUNT}`].join(''));
  }
}

if (command === 'study') study();
else if (command === 'curve') curve();
else if (command === 'sweep') sweep();
else console.log('Usage: npm run balance -- study|curve|sweep   (see the header of src/sim/cli.ts)');
