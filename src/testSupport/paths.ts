// Helpers for tests that scan the repository, so they behave the same on Windows (backslash paths, CRLF files) and POSIX.
// Not part of the app: nothing under src/ imports this except tests.

/** Repository-relative or absolute path with forward slashes, whatever the platform separator was. */
export const toPosix = (p: string): string => p.replace(/\\/g, '/');

/** Path relative to `root`, with forward slashes. */
export const relPosix = (root: string, p: string): string => {
  const r = toPosix(root).replace(/\/+$/, '');
  const f = toPosix(p);
  return f.startsWith(`${r}/`) ? f.slice(r.length + 1) : f;
};

/** Lines of a text file, treating CRLF and LF alike (git on Windows may check files out with CRLF). */
export const textLines = (text: string): string[] => text.split(/\r?\n/);
