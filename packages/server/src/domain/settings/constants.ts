// domain/settings/constants — the themes-slice sentinel ids (themes-design.md §2.1/§5, the
// SYSTEM_DEFAULT_PRESET_ID pattern from `domain/preset/constants.ts`). Fixed sentinel TypeIDs for the
// THREE seed palettes: not cross-boundary (no client needs the raw ids — the view's derived `isSeed`
// flag is what the client reads), so this lives in `domain/settings`, NOT `@orb/contracts`. The seed
// insert (`seed-themes.ts`), the write-verb `fetchOwned` guard (implicit — a NULL owner never matches a
// caller), and any future direct reference all pivot on these constants simultaneously. MUST NOT change
// (a test pins these literals as valid theme ids).

import type { ThemeId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const THEME_HEARTH_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000001");
export const THEME_MOCHA_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000002");
export const THEME_LIGHT_ID: ThemeId = castId<ThemeId>("theme_00000000000000000000000003");

export const THEME_HEARTH_NAME = "Hearth";
export const THEME_MOCHA_NAME = "Mocha";
export const THEME_LIGHT_NAME = "Light";
