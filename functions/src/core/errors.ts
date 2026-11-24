export type ErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition' | 'resource-exhausted' | 'aborted';

/** Thrown for malformed, unauthorized or abusive requests. Mapped to HttpsError by the Functions wrapper. */
export class ServiceError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
