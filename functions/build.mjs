// Bundles the trusted service (and the shared pure rules in ../src/game) into functions/lib/index.js so the Functions
// package is self-contained. firebase-admin and firebase-functions stay external (installed in functions/node_modules).
import { build } from 'esbuild';

await build({
  entryPoints: ['functions/src/index.ts'],
  outfile: 'functions/lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*'],
  sourcemap: true,
  logLevel: 'info',
});
