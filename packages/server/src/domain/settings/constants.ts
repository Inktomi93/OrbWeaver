// domain/settings/constants — fixed sentinel TypeIDs for the seed palettes. Not cross-boundary (the view's
// derived isSeed flag is what the client reads), so this lives here, not @orb/contracts.
// MUST NOT change — a test pins these literals as valid theme ids, and the RETIRED ids below are the only
// handle the converge-seeder has on rows that already shipped.
//
// Ids 01–03 are the shipped set (D62): Hearth · Mocha · Light. Each non-Hearth palette pairs with an
// `@orb/ui` value-set at `src/tokens/themes/<lowercased name>.json` — the pairing suite asserts that
// set-equality BOTH ways, so a palette added here without its json (or the reverse) goes red.
//
// Ids 04–13 were the default-character pack's palettes, published as installable app themes. They are
// RETIRED (owner ruling, TD/O-9): a character's palette is the CARD's identity, carried into the room by
// the card, not a picker entry the user scrolls past ten of. The ids stay spelled here because the seeder
// must DELETE those rows on every install that already has them — a retired sentinel with no delete arm is
// an orphan row forever. The palettes themselves did not die: every card still carries its own colours as
// its `themeOverride`, and "Save as theme…" (TD door 1) re-mints any of them as a real theme on demand.

import type { ThemeId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const THEME_HEARTH_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000001");
export const THEME_MOCHA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000002");
export const THEME_LIGHT_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000003");

export const THEME_HEARTH_NAME = "Hearth";
export const THEME_MOCHA_NAME = "Mocha";
export const THEME_LIGHT_NAME = "Light";

/** The retired default-character palette rows (ids 04–13, TD/O-9) — the seeder's DELETE targets. Scoped to
 *  these exact sentinel ids and to `ownerId IS NULL`, so a user's own theme can never be caught by it (a
 *  duplicate they made of one of these palettes is THEIR row and survives untouched). */
export const RETIRED_SEED_THEME_IDS: readonly ThemeId[] = [
  castId<ThemeId>("theme_00000000000000000000000004"), // Charlotte
  castId<ThemeId>("theme_00000000000000000000000005"), // JFC
  castId<ThemeId>("theme_00000000000000000000000006"), // Niko
  castId<ThemeId>("theme_00000000000000000000000007"), // Hana
  castId<ThemeId>("theme_00000000000000000000000008"), // Morgatha
  castId<ThemeId>("theme_00000000000000000000000009"), // Sabine
  castId<ThemeId>("theme_00000000000000000000000010"), // Birdie
  castId<ThemeId>("theme_00000000000000000000000011"), // Kohaku
  castId<ThemeId>("theme_00000000000000000000000012"), // Calamity
  castId<ThemeId>("theme_00000000000000000000000013"), // Elias
];
