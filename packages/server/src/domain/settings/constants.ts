// domain/settings/constants — fixed sentinel TypeIDs for the seed palettes: the three base palettes plus
// the ten default-character palettes. Not cross-boundary (the view's derived isSeed flag is what the client
// reads), so this lives here, not @orb/contracts.
// MUST NOT change — a test pins these literals as valid theme ids.
//
// Ids 01–03 are the base palettes; 04–13 pair 1:1 with the default-character pack (`domain/character/
// seeder/cards.ts`) and with the `@orb/ui` value-sets at `src/tokens/themes/<lowercased name>.json` — the
// pairing suite asserts that set-equality BOTH ways, so a palette added here without its json (or the
// reverse) goes red.

import type { ThemeId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const THEME_HEARTH_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000001");
export const THEME_MOCHA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000002");
export const THEME_LIGHT_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000003");
export const THEME_CHARLOTTE_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000004");
export const THEME_JFC_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000005");
export const THEME_NIKO_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000006");
export const THEME_HANA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000007");
export const THEME_MORGATHA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000008");
export const THEME_SABINE_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000009");
export const THEME_BIRDIE_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000010");
export const THEME_KOHAKU_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000011");
export const THEME_CALAMITY_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000012");
export const THEME_ELIAS_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000013");

export const THEME_HEARTH_NAME = "Hearth";
export const THEME_MOCHA_NAME = "Mocha";
export const THEME_LIGHT_NAME = "Light";
export const THEME_CHARLOTTE_NAME = "Charlotte";
export const THEME_JFC_NAME = "JFC";
export const THEME_NIKO_NAME = "Niko";
export const THEME_HANA_NAME = "Hana";
export const THEME_MORGATHA_NAME = "Morgatha";
export const THEME_SABINE_NAME = "Sabine";
export const THEME_BIRDIE_NAME = "Birdie";
export const THEME_KOHAKU_NAME = "Kohaku";
export const THEME_CALAMITY_NAME = "Calamity";
export const THEME_ELIAS_NAME = "Elias";
