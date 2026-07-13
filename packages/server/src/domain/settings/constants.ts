// domain/settings/constants — fixed sentinel TypeIDs for the three seed palettes. Not cross-boundary (the
// view's derived isSeed flag is what the client reads), so this lives here, not @orb/contracts.
// MUST NOT change — a test pins these literals as valid theme ids.

import type { ThemeId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const THEME_HEARTH_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000001");
export const THEME_MOCHA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000002");
export const THEME_LIGHT_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000003");

export const THEME_HEARTH_NAME = "Hearth";
export const THEME_MOCHA_NAME = "Mocha";
export const THEME_LIGHT_NAME = "Light";
