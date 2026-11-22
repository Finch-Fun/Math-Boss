import { lazy, type ComponentType } from 'react';
import type { Game } from './useGame';

/**
 * The only place that decides whether developer tools exist in this build.
 * `import.meta.env.DEV` is replaced by a literal at build time (true on the dev server, false in `vite build`), so in a
 * production bundle this is `null` and the DevPanel module and the game/dev helpers are never emitted.
 * It is deliberately not derived from a user, a role, or any Firestore field.
 */
export const devTools: ComponentType<{ game: Game }> | null = import.meta.env.DEV ? lazy(() => import('./DevPanel')) : null;
