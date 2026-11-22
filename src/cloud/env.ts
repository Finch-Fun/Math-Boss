import type { Env } from './config';

/** Vite injects import.meta.env at build time. Read in one place so the rest of the code stays testable. */
export const viteEnv: Env = (import.meta as unknown as { env?: Env }).env ?? {};
