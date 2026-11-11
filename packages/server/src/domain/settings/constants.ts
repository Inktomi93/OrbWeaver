// domain/settings/constants — fixed sentinel TypeIDs for the seed palettes. Not cross-boundary (the view's
// derived isSeed flag is what the client reads), so this lives here, not @orb/contracts.
// That sentence went briefly false — #1667 found the client identifying the default palette by its DISPLAY
// NAME — and was RESTORED by #1671 rather than reversed: the view gained a second derived flag,
// `isDefault` (`substrate/theme-views.ts`, the one reader of THEME_HEARTH_ID outside the seeder), so a
// derived flag is again what crosses. The ruling survived; its input changed.
// MUST NOT change — tests/server/domain/settings/seed-theme-pairing.suite.test.ts pins these literals as the shipped ids, and the RETIRED ids below are the only
// handle the converge-seeder has on rows that already shipped.
//
// Ids 01–03 are the shipped set (D62): Hearth · Mocha · Light. Each non-Hearth palette pairs with an
// `@orb/ui` value-set at `src/tokens/themes/<lowercased name>.json` — tests/server/domain/settings/seed-theme-pairing.suite.test.ts
// asserts each override equals its value set, so a palette added here without its json goes red.
//
// Ids 04–13 were the default-character pack's palettes, published as installable app themes. They are
// RETIRED (owner ruling, TD/O-9): a character's palette is the CARD's identity, carried into the room by
// the card, not a picker entry the user scrolls past ten of. The ids stay spelled here because the seeder
// must DELETE those rows on every install that already has them — a retired sentinel with no delete arm is
// an orphan row forever. The palettes themselves did not die: every card still carries its own colours as
// its `themeOverride`, and "Save as theme…" (TD door 1) re-mints any of them as a real theme on demand.

import type { ThemeId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";

const THEME_ID = typeIdSchema(ID_PREFIX.theme);

export const THEME_HEARTH_ID: ThemeId = THEME_ID.parse("theme_00000000000000000000000001");
export const THEME_MOCHA_ID: ThemeId = THEME_ID.parse("theme_00000000000000000000000002");
export const THEME_LIGHT_ID: ThemeId = THEME_ID.parse("theme_00000000000000000000000003");

export const THEME_HEARTH_NAME = "Hearth";
export const THEME_MOCHA_NAME = "Mocha";
export const THEME_LIGHT_NAME = "Light";

/** The retired default-character palette rows (ids 04–13, TD/O-9) — the seeder's DELETE targets. Scoped to
 *  these exact sentinel ids and to `ownerId IS NULL`, so a user's own theme can never be caught by it (a
 *  duplicate they made of one of these palettes is THEIR row and survives untouched). */
export const RETIRED_SEED_THEME_IDS: readonly ThemeId[] = [
  THEME_ID.parse("theme_00000000000000000000000004"), // Charlotte
  THEME_ID.parse("theme_00000000000000000000000005"), // JFC
  THEME_ID.parse("theme_00000000000000000000000006"), // Niko
  THEME_ID.parse("theme_00000000000000000000000007"), // Hana
  THEME_ID.parse("theme_00000000000000000000000008"), // Morgatha
  THEME_ID.parse("theme_00000000000000000000000009"), // Sabine
  THEME_ID.parse("theme_00000000000000000000000010"), // Birdie
  THEME_ID.parse("theme_00000000000000000000000011"), // Kohaku
  THEME_ID.parse("theme_00000000000000000000000012"), // Calamity
  THEME_ID.parse("theme_00000000000000000000000013"), // Elias
];
