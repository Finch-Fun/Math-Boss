// Cloud Functions entry point: thin callable wrappers around the trusted game service (functions/src/core/service.ts).
// Local-first: these are meant to run in the Firebase Emulator Suite. They are NOT deployed by this repo's scripts.
// Identity (uid, email, sign-in provider) is taken from the verified auth token, never from the request body.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { clockFor, controlDevClock, devClockEnabled, type DevClockCommand } from './core/clock';
import { ServiceError } from './core/errors';
import { GameService, type Caller } from './core/service';
import { FirestoreStore } from './firestoreStore';

initializeApp();
const store = new FirestoreStore(getFirestore());
const env = process.env;
const service = new GameService({ store, clock: clockFor(env) });

// Region and limits are deliberately conservative. No scheduled functions are defined anywhere in this package.
const opts = { region: 'us-central1', maxInstances: 10, cors: true } as const;

function callerOf(req: CallableRequest<unknown>): Caller {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const t = req.auth.token as { email?: string; email_verified?: boolean; firebase?: { sign_in_provider?: string } };
  return { uid: req.auth.uid, email: t.email, emailVerified: t.email_verified, provider: t.firebase?.sign_in_provider };
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) throw new HttpsError(e.code, e.message);
    if (e instanceof HttpsError) throw e;
    console.error('mb internal error', e);
    throw new HttpsError('internal', 'Something went wrong. Please try again.');
  }
}

export const mbSync = onCall(opts, (req) => guard(() => service.sync(callerOf(req), req.data)));
export const mbGetDaily = onCall(opts, (req) => guard(() => service.getDaily(callerOf(req), req.data)));
export const mbSubmitDaily = onCall(opts, (req) => guard(() => service.submitDaily(callerOf(req), req.data)));
export const mbGetBonus = onCall(opts, (req) => guard(() => service.getBonus(callerOf(req), req.data)));
export const mbSubmitBonus = onCall(opts, (req) => guard(() => service.submitBonus(callerOf(req), req.data)));
export const mbPurchaseUpgrade = onCall(opts, (req) => guard(() => service.purchaseUpgrade(callerOf(req), req.data)));
export const mbDonate = onCall(opts, (req) => guard(() => service.donate(callerOf(req), req.data)));

// Development-only test clock (callable name "mbDevClock"). It is defined only inside the emulator with an explicit opt-in, so a
// production deployment of this package has no such endpoint at all. controlDevClock re-checks the same condition.
export const mbDevClock = devClockEnabled(env)
  ? onCall(opts, (req) => {
      callerOf(req);
      return guard(() => controlDevClock(store, env, req.data as DevClockCommand));
    })
  : undefined;
