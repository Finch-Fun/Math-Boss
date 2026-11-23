// Same as scripts/emulators.mjs, with the emulator-only test clock enabled.
process.argv.push('--dev-clock');
await import('./emulators.mjs');
