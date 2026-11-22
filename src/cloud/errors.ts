// Turns SDK errors into messages a teacher or student can act on.
export type CloudErrorCode =
  | 'config_missing'
  | 'invalid_code'
  | 'invalid_input'
  | 'not_approved_teacher'
  | 'permission_denied'
  | 'offline'
  | 'auth_provider_disabled'
  | 'popup_closed'
  | 'code_collision'
  | 'unknown';

export class CloudError extends Error {
  readonly code: CloudErrorCode;
  constructor(code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

export function toCloudError(e: unknown, fallback = 'Something went wrong. Please try again.'): CloudError {
  if (e instanceof CloudError) return e;
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'permission-denied':
      return new CloudError('permission_denied', 'You do not have permission to do that. If you think this is a mistake, ask your teacher.');
    case 'unavailable':
    case 'auth/network-request-failed':
      return new CloudError('offline', 'Cannot reach Firebase. Check the internet connection (or that the emulators are running) and try again.');
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new CloudError('popup_closed', 'Sign-in was cancelled.');
    case 'auth/operation-not-allowed':
      return new CloudError('auth_provider_disabled', 'This sign-in method is not enabled in the Firebase console yet (see docs/FIREBASE_SETUP.md).');
    case 'auth/credential-already-in-use':
      return new CloudError('invalid_input', 'That Google account is already linked to a different student.');
    default:
      return new CloudError('unknown', e instanceof Error && e.message ? `${fallback} (${e.message})` : fallback);
  }
}
