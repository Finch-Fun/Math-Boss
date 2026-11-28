# Animated battlefield and student UI (PR #10)

The student home is a hero **battlefield** with game-style panels below it. Boss on the LEFT (faces right); castle, rangers and mages on the RIGHT;
warriors in the middle; all student characters face LEFT. The whole picture is one SVG with a fixed 1000 x 440 coordinate system, so positions are
identical on every screen size and it just scales down.

## It is only a picture
`src/battlefield/*` reads the existing campaign state (server-settled, client-projected) or the local demo state and draws it. It imports nothing from
`src/cloud`, Firebase or the network, uses no randomness or clocks, and runs no JS frame loop. Swings, arrows and spells are looping CSS
transform animations; the real boss HP, castle HP and damage come from the server's numbers in the health bars. Tests enforce all of this.

## Character classes (Warrior, Ranger, Mage)
Cosmetic only. `classForUid(uid)` hashes the student's persistent identity (FNV-1a), so the class is stable across refreshes, sign-outs and devices,
needs no database field or migration, and cannot be rerolled. Combat code never references classes; upgrade and DPS formulas are unchanged.
Changing the hash would reshuffle everyone, so the test suite pins known values.

## What each mode shows
Only activated students attack, and only while the server state is "fighting". Preparation, breach, idle and "waiting for the first student" stop all
attacks and show a text banner. A boss defeat plays a short defeat animation, a victory banner, then preparation mode.

## Large classrooms and privacy
Individual sprites are capped by screen width (28 wide, 20, 14, 10 on phones); the class mix is kept, your own character is always drawn with a "YOU"
tag, and the rest is summarised ("showing 28 of 40"). Totals and DPS always describe the whole class.
In Firebase mode the rules keep other students' records private, so the battlefield is built from the public class totals plus your own identity:
classmates are drawn as anonymous fighters (stand-ins), and the UI says so. No names or academic data appear on the battlefield.

## Replacing the artwork
Art is isolated in `src/battlefield/art/` (`characters.tsx`, `boss.tsx`, `scenery.tsx`): each class art is a component taking a `variant`; the boss art
is looked up with `bossArtFor(number)` so each weekly boss can have its own sprite while sharing the same animation hooks (`.boss-breath`, `.boss-lunge`,
`.boss-arm`). Replace those files; layout, slots and animation timing are in `layout.ts` and `battlefield.css`.

## Design system
`src/theme.css` holds the tokens (colour, type scale, spacing, shape, breakpoints) and component styles; `src/ui/game/kit.tsx` has Panel, SectionHeading,
HealthBar, ProgressBar, Currency, StatusPill and the StudentHud. The older generic classes are restyled, so teacher screens pick up the new theme
without being redesigned.
