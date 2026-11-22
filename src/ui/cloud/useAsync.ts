import { useCallback, useState } from 'react';
import { toCloudError } from '../../cloud/errors';

/** Runs one user action at a time and keeps a friendly error message for the screen. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      const err = toCloudError(e);
      if (err.code !== 'popup_closed') setError(err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
