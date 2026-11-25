// One-command live deployment: checks, builds, and deploys Hosting + Firestore rules/indexes + Functions to YOUR Firebase project.
//   npm run deploy:check     everything except the final `firebase deploy` (safe: touches nothing live)
//   npm run deploy:live      deploy (run after the PR is merged and you are on an up-to-date main)
// Options: --only hosting,functions,firestore:rules,firestore:indexes   --skip-tests   --allow-branch
// The project id is read from .env.production.local and passed explicitly to Firebase; `--force` is not supported.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLeaks, mergeViteEnv, parseDeployArgs, parseEnvFile, planDeploy, FORBIDDEN_FUNCTIONS_KEYS, type EnvMap } from '../functions/src/deployPlan';

const read = (p: string): string | undefined => (existsSync(p) ? readFileSync(p, 'utf8') : undefined);
const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'inherit', shell: true });
const step = (title: string, cmd: string, args: string[]) => {
  console.log(`\n=== ${title} ===`);
  if (run(cmd, args).status !== 0) fail(`${title} failed.`);
};
const fail = (msg: string): never => {
  console.error(`\n${msg}`);
  process.exit(1);
};
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

let args;
try {
  args = parseDeployArgs(process.argv.slice(2));
} catch (e) {
  fail((e as Error).message);
}
args = args!;

const git = (a: string[]) => spawnSync('git', a, { encoding: 'utf8', shell: true }).stdout?.trim() ?? '';
if (!args.allowBranch && !args.check) {
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') fail('Deploy from the main branch (git checkout main && git pull), or pass --allow-branch.');
  if (git(['status', '--porcelain'])) fail('You have uncommitted changes. Commit or stash them first, or pass --allow-branch.');
  run('git', ['fetch', 'origin', 'main']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main'])) fail('Your main is not up to date with origin/main. Run: git pull');
}

const viteEnv = mergeViteEnv(
  { env: read('.env'), local: read('.env.local'), production: read('.env.production'), productionLocal: read('.env.production.local') },
  process.env,
);
const fnEnv: Record<string, EnvMap> = {};
for (const f of existsSync('functions') ? readdirSync('functions').filter((n) => n.startsWith('.env') && n !== '.env.example') : []) {
  fnEnv[`functions/${f}`] = parseEnvFile(read(join('functions', f)) ?? '');
}
let plan;
try {
  plan = planDeploy(viteEnv, args, fnEnv, process.env);
} catch (e) {
  fail((e as Error).message);
}
plan = plan!;
console.log(`Project:  ${plan.projectId}\nRegion:   ${plan.region}\nSite:     ${plan.hostingUrl}\nCORS:     ${plan.origins.join(', ')}`);

if (!args.skipTests) {
  step('Unit tests', 'npm', ['test']);
  step('Typecheck', 'npm', ['run', 'typecheck']);
}
step('Build web app (production)', 'npx', ['vite', 'build', '--mode', 'production']);
step('Build Cloud Functions', 'npm', ['run', 'build:functions']);

// The static site must not contain private or fake bank text.
const fixture = JSON.parse(read('functions/dev-fixtures/bonus-bank.dev.json') ?? '{"questions":[]}') as { questions: { prompt: string; explanation: string }[] };
const needles = [...fixture.questions.flatMap((q) => [q.prompt, q.explanation]), 'serverOnly/bonusBank'];
const dist = walk('dist').filter((f) => /\.(js|html|css|json|map)$/.test(f)).map((name) => ({ name, text: readFileSync(name, 'utf8') }));
const leaks = findLeaks(dist, needles);
if (!dist.length) fail('dist/ is empty: the web build did not produce output.');
if (leaks.length) fail(`The built site contains private data:\n - ${leaks.join('\n - ')}`);
console.log('Site scan: no bonus questions, answers or private references in dist/.');

writeFileSync(join('functions', plan.functionsEnvFile), plan.functionsEnvText);
for (const k of FORBIDDEN_FUNCTIONS_KEYS) if (readFileSync(join('functions', plan.functionsEnvFile), 'utf8').includes(k)) fail(`${k} in generated env.`);
console.log(`Wrote functions/${plan.functionsEnvFile} (region + CORS origins).`);

if (args.check) {
  console.log(`\nCheck passed. Nothing was deployed. To deploy: npm run deploy:live\nThis would run: firebase ${plan.firebaseArgs.join(' ')}`);
  process.exit(0);
}
step('Deploy to Firebase', 'npx', ['firebase', ...plan.firebaseArgs]);
console.log(`\nDeployed. Live site: ${plan.hostingUrl}`);
