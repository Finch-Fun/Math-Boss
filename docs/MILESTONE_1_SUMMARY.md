# Milestone 1 summary: Firebase classroom foundation

**Built:** Google teacher sign-in with a console-managed allowlist; classroom create, list, select, edit and archive; 8-character join codes; student joining with teacher approval (or optional auto-approve); persistent anonymous student identity with optional Google linking; roster and approval screens; Firestore rules; emulator config; rules tests; env template and setup guide.

**Unchanged:** every gameplay system and every balance value (30 h spawn cutoff, 120 attack/hour included). The game rules engine does not import Firebase.

**Not built (by design):** shared multiplayer combat, authoritative coins/upgrades/boss damage, student account recovery beyond Google linking, deployment, billing, Cloud Functions.

**Verification limits:** see the pull request description. In short, the rules tests and the Firebase SDK integration could not be executed in the build environment (no network, no emulator), so they are written but unverified until you run `npm install` and `npm run test:rules`.

Setup and architecture details: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
