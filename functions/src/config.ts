// Deployment options for every callable function, in one pure module (unit-tested without the Firebase SDK).
//
// Cost and safety posture (Blaze pay-as-you-go, no hard spending cap exists, so these are the guard rails that DO exist):
//   * maxInstances 5       caps parallel instances, so a traffic spike or a retry loop cannot fan out into many billed instances.
//   * minInstances 0       nothing runs (or bills) while idle. No scheduled function exists anywhere in this package.
//   * memory 256MiB        the service is small; larger memory only raises the per-second price.
//   * timeoutSeconds 15    an invocation is bounded. A normal request takes well under a second; settlement is closed-form and bounded
//                          (at most 8 simulated weeks, at most 200 roster students), so 15s is generous headroom.
// Concurrency is left at the platform default: raising it needs a full vCPU per instance, which costs more.
import { resolveFunctionsRegion } from '../../src/cloud/functionsConfig';

export const MAX_INSTANCES = 5;

/** CORS: restrict callables to your hosting origins in production (comma-separated MATHBOSS_ALLOWED_ORIGINS); open in the emulator. */
export function parseOrigins(raw: string | undefined): string[] | true {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : true;
}

export function functionOptions(env: Record<string, string | undefined>) {
  return {
    region: resolveFunctionsRegion(env.MATHBOSS_FUNCTIONS_REGION),
    maxInstances: MAX_INSTANCES,
    minInstances: 0,
    memory: '256MiB' as const,
    timeoutSeconds: 15,
    cors: parseOrigins(env.MATHBOSS_ALLOWED_ORIGINS),
  };
}
