// Which parts of the local game UI each place in the app may show. Pure so it can be tested without a browser.
//
// This is UI structure, not the security boundary: real classroom data is protected by firestore.rules, and none of the
// local game views can reach Firebase at all. The rules here make sure the wrong *interface* is never even mounted.

/** Where a GameWorkspace is shown. */
export type Surface =
  | 'demo' // local demo, no Firebase
  | 'teacher-preview' // inside a Firebase classroom, for an approved teacher
  | 'student-practice'; // inside a Firebase classroom, for a student

export type WorkspaceView = 'student' | 'teacher' | 'dev';

/**
 * `devToolsBuild` is true only when the build itself includes the developer tools (Vite dev server).
 * It comes from the build environment, never from a user, a role, or a Firestore field.
 */
export function allowedViews(surface: Surface, devToolsBuild: boolean): WorkspaceView[] {
  switch (surface) {
    case 'student-practice':
      return ['student'];
    case 'teacher-preview':
      return ['student', 'teacher']; // gameplay preview + Battle Report of the SIMULATED class; no developer tools
    case 'demo':
      return devToolsBuild ? ['student', 'teacher', 'dev'] : ['student', 'teacher'];
  }
}

/** Whatever the UI state asks for, only an allowed view is ever rendered. */
export function effectiveView(requested: WorkspaceView, allowed: WorkspaceView[]): WorkspaceView {
  return allowed.includes(requested) ? requested : allowed[0];
}

/**
 * The local demo shows a simulated Teacher view, so it is not offered next to real sign-in in a production build that has
 * Firebase configured: a signed-in student must not be able to reach it. It stays available for local development
 * (dev server) and in credential-less builds, where there is no Firebase session to protect.
 */
export function demoOffered(firebaseConfigured: boolean, devToolsBuild: boolean): boolean {
  return !firebaseConfigured || devToolsBuild;
}
