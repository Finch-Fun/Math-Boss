// The authoritative clock. Production always uses the server's own time. The test clock exists only for local simulation:
// it is reachable only when the process is the Functions *emulator* and an explicit opt-in variable is set, and the browser
// can never supply a time to any game operation (requests have no timestamp field, and unknown fields are rejected).
import { ServiceError } from './errors';
import type { ClockSource, DocStore } from './store';

export const DEV_CLOCK_PATH = 'serverOnly/devClock';

export const systemClock: ClockSource = async () => Date.now();

/** Reads the emulator-only offset document. Never used unless devClockEnabled(env) was true at startup. */
export const devClock: ClockSource = async (tx) => {
  const d = await tx.get<{ mode?: 'fixed' | 'offset'; value?: number }>(DEV_CLOCK_PATH);
  if (!d || typeof d.value !== 'number') return Date.now();
  return d.mode === 'fixed' ? d.value : Date.now() + d.value;
};

export function devClockEnabled(env: Record<string, string | undefined>): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' && env.MATHBOSS_ENABLE_TEST_CLOCK === 'true';
}

export const clockFor = (env: Record<string, string | undefined>): ClockSource => (devClockEnabled(env) ? devClock : systemClock);

export type DevClockCommand = { action: 'set'; ms: number } | { action: 'advance'; ms: number } | { action: 'reset' };

/** Controls the emulator test clock. Throws unless the dev clock is enabled for this process. */
export async function controlDevClock(store: DocStore, env: Record<string, string | undefined>, cmd: DevClockCommand): Promise<{ now: number }> {
  if (!devClockEnabled(env)) throw new ServiceError('permission-denied', 'The test clock is not available here.');
  if (cmd.action !== 'reset' && (!Number.isFinite(cmd.ms) || Math.abs(cmd.ms) > 4e12)) throw new ServiceError('invalid-argument', 'Invalid time.');
  return store.runTransaction(async (tx) => {
    const cur = await tx.get<{ mode?: 'fixed' | 'offset'; value?: number }>(DEV_CLOCK_PATH);
    const now = await devClock(tx);
    if (cmd.action === 'reset') tx.set(DEV_CLOCK_PATH, { mode: 'offset', value: 0 });
    else if (cmd.action === 'set') tx.set(DEV_CLOCK_PATH, { mode: 'fixed', value: cmd.ms });
    else tx.set(DEV_CLOCK_PATH, { mode: 'fixed', value: now + cmd.ms });
    void cur;
    return { now: cmd.action === 'reset' ? Date.now() : cmd.action === 'set' ? cmd.ms : now + cmd.ms };
  });
}
