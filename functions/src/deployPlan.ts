// Pure planning and safety checks for `npm run deploy:live` (scripts/deploy.ts). No I/O here, so it is unit-tested.
//
// Goals: the project id comes from ONE place (your .env.production.local), is passed explicitly to every Firebase command, can never be
// a demo/emulator project, and the Functions region and CORS origins are derived from the same values the browser build uses.
import { resolveFunctionsRegion } from '../../src/cloud/functionsConfig';

export type EnvMap = Record<string, string | undefined>;

/** Minimal .env parser (KEY=value, # comments, optional quotes). */
export function parseEnvFile(text: string): EnvMap {
  const out: EnvMap = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

/** What `vite build` (mode production) sees: .env < .env.local < .env.production < .env.production.local, then process VITE_* variables. */
export function mergeViteEnv(files: { env?: string; local?: string; production?: string; productionLocal?: string }, processEnv: EnvMap): EnvMap {
  const merged: EnvMap = {};
  for (const text of [files.env, files.local, files.production, files.productionLocal]) if (text) Object.assign(merged, parseEnvFile(text));
  for (const [k, v] of Object.entries(processEnv)) if (k.startsWith('VITE_') && v !== undefined && v !== '') merged[k] = v;
  return merged;
}

export const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export const REQUIRED_WEB_KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;
/** Variables that must never reach a production Functions deployment. */
export const FORBIDDEN_FUNCTIONS_KEYS = ['MATHBOSS_ENABLE_TEST_CLOCK', 'FUNCTIONS_EMULATOR'] as const;
export const ALL_TARGETS = ['hosting', 'firestore:rules', 'firestore:indexes', 'functions'] as const;

export interface DeployArgs {
  check: boolean;
  allowBranch: boolean;
  skipTests: boolean;
  only?: string[];
  project?: string;
}

export function parseDeployArgs(argv: string[]): DeployArgs {
  const a: DeployArgs = { check: false, allowBranch: false, skipTests: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--check') a.check = true;
    else if (v === '--allow-branch') a.allowBranch = true;
    else if (v === '--skip-tests') a.skipTests = true;
    else if (v === '--only') a.only = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (v === '--project') a.project = argv[++i];
    else if (v === '--force' || v.startsWith('--force')) throw new Error('--force is not supported: this workflow never bypasses Firebase warnings.');
    else throw new Error(`Unknown argument: ${v}`);
  }
  if (a.only) {
    const bad = a.only.filter((t) => !(ALL_TARGETS as readonly string[]).includes(t));
    if (bad.length || !a.only.length) throw new Error(`--only accepts: ${ALL_TARGETS.join(', ')}`);
  }
  return a;
}

export interface DeployPlan {
  projectId: string;
  region: string;
  hostingUrl: string;
  origins: string[];
  functionsEnvFile: string;
  functionsEnvText: string;
  firebaseArgs: string[];
}

/** Throws one Error listing every problem found, so you can fix them all at once. */
export function planDeploy(viteEnv: EnvMap, args: DeployArgs, existingFunctionsEnv: Record<string, EnvMap>, processEnv: EnvMap = {}): DeployPlan {
  const problems: string[] = [];
  const clean = (v: string | undefined) => (v ?? '').trim();

  const missing = REQUIRED_WEB_KEYS.filter((k) => !clean(viteEnv[k]));
  if (missing.length) problems.push(`Missing in .env.production.local: ${missing.join(', ')} (copy .env.production.example).`);

  const projectId = clean(viteEnv.VITE_FIREBASE_PROJECT_ID);
  if (projectId) {
    if (projectId.startsWith('demo-')) problems.push(`"${projectId}" is an emulator-only "demo-" project. Use your real Firebase project id.`);
    else if (!PROJECT_ID.test(projectId)) problems.push(`"${projectId}" is not a valid Firebase project id.`);
  }
  if (args.project && projectId && args.project !== projectId) {
    problems.push(`--project ${args.project} does not match VITE_FIREBASE_PROJECT_ID (${projectId}). The site and the backend must be the same project.`);
  }
  if (clean(viteEnv.VITE_USE_FIREBASE_EMULATOR).toLowerCase() === 'true') problems.push('VITE_USE_FIREBASE_EMULATOR must be false for a live build.');

  const regionRaw = clean(viteEnv.VITE_FUNCTIONS_REGION);
  const region = resolveFunctionsRegion(regionRaw);
  if (regionRaw && region !== regionRaw) problems.push(`VITE_FUNCTIONS_REGION "${regionRaw}" is not a valid region (example: us-central1).`);

  for (const k of FORBIDDEN_FUNCTIONS_KEYS) {
    if (clean(processEnv[k])) problems.push(`${k} is set in your shell. Unset it before deploying (it must never reach production).`);
    for (const [file, vars] of Object.entries(existingFunctionsEnv)) {
      if (k in vars) problems.push(`${k} appears in ${file}. Remove it (the test clock is emulator-only).`);
    }
  }
  if (processEnv.MATHBOSS_FUNCTIONS_REGION && resolveFunctionsRegion(processEnv.MATHBOSS_FUNCTIONS_REGION) !== region) {
    problems.push('MATHBOSS_FUNCTIONS_REGION in your shell differs from VITE_FUNCTIONS_REGION. Unset it; the deploy script sets it for you.');
  }
  if (problems.length) throw new Error(`Deployment blocked:\n - ${problems.join('\n - ')}`);

  const origins = [`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`];
  const authDomain = clean(viteEnv.VITE_FIREBASE_AUTH_DOMAIN);
  if (authDomain && !origins.includes(`https://${authDomain}`) && /^[a-z0-9.-]+$/i.test(authDomain) && authDomain !== 'localhost') origins.push(`https://${authDomain}`);

  const only = args.only?.length ? args.only : [...ALL_TARGETS];
  return {
    projectId,
    region,
    hostingUrl: `https://${projectId}.web.app`,
    origins,
    functionsEnvFile: `.env.${projectId}`,
    functionsEnvText:
      `# Generated by npm run deploy:live from .env.production.local. Do not edit or commit (gitignored).\n` +
      `MATHBOSS_FUNCTIONS_REGION=${region}\nMATHBOSS_ALLOWED_ORIGINS=${origins.join(',')}\n`,
    firebaseArgs: ['deploy', '--project', projectId, '--only', only.join(','), '--non-interactive'],
  };
}

/** Strings from the fake dev bank that must never appear in the deployed static site. */
export function findLeaks(files: { name: string; text: string }[], needles: string[]): string[] {
  const hits: string[] = [];
  for (const f of files) for (const n of needles) if (n && f.text.includes(n)) hits.push(`${f.name} contains "${n.slice(0, 40)}"`);
  return hits;
}
