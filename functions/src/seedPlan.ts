// Safety rules for seeding the private Bonus Question bank (scripts/seed-bonus-bank.ts). Pure, so it is unit-tested.
export interface SeedArgs {
  file?: string;
  emulator: boolean;
  live: boolean;
  project?: string;
}
export type SeedPlan = { target: 'emulator'; project: 'demo-math-boss' } | { target: 'live'; project: string };

export function parseSeedArgs(argv: string[]): SeedArgs {
  const a: SeedArgs = { emulator: false, live: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--emulator') a.emulator = true;
    else if (v === '--live') a.live = true;
    else if (v === '--project') a.project = argv[++i];
    else if (!v.startsWith('--') && !a.file) a.file = v;
    else throw new Error(`Unknown argument: ${v}`);
  }
  return a;
}

export function planSeed(args: SeedArgs, bankIsDevFixture: boolean): SeedPlan {
  if (!args.file) throw new Error('Give the bank file: npm run seed:bonus -- <file.json> (--emulator | --project <id> --live)');
  if (args.emulator === args.live) throw new Error('Choose exactly one target: --emulator or --live.');
  if (args.emulator) return { target: 'emulator', project: 'demo-math-boss' };
  if (!args.project) throw new Error('--live needs --project <your-firebase-project-id>.');
  if (args.project.startsWith('demo-')) throw new Error('"demo-" projects are emulator-only. Use --emulator.');
  if (bankIsDevFixture) throw new Error('This file is marked devOnly (fake questions with public answers). It can only be seeded into the emulator.');
  return { target: 'live', project: args.project };
}
