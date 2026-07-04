// @orb/contracts/theme — the D44 §12.5 contracts home for theming: the `ThemeOverride` wire clamp
// (override.ts — the ONE wire copy of the §12.1 token subset) + the `Theme` entity shapes
// (themes-design.md §3.2 — the single-owned user theme library; the SERVER slice — table, verbs,
// seeding — is the unbuilt themes wave; these shapes land born-compliant so the D44 per-character
// theme column and the client `<ThemeScope>` consumers build against one home). A theme entity is
// its own module (not `/settings`): `ThemeOverride` has three unrelated consumers (the settings-
// homed entity, the character-row theme column, `<ThemeScope>`) — first-consumer misfiling is the
// `schema/search.ts` naming lie (themes-design §3.1).

import { z } from "zod";
import { themeOverrideSchema } from "./override";

export type {
  ThemeChatStyle,
  ThemeDensity,
  ThemeFont,
  ThemeOverride,
  ThemeRadius,
} from "./override";
export {
  THEME_CHAT_STYLES,
  THEME_DENSITIES,
  THEME_FONT_ALLOWLIST,
  THEME_RADII,
  themeOverrideSchema,
} from "./override";

/** Name/CSS length caps (themes-design §3.2 — named constants, shared with the future db CHECKs). */
export const THEME_NAME_MAX = 80;
export const THEME_CSS_MAX = 65_536; // custom CSS is a text field, not a blob store

/** The theme entity view (themes-design §3.2). `isSeed` DERIVES at projection from a NULL owner —
 *  never a stored column; seeds are code-authored, non-deletable, duplicate-to-customize. */
export const themeSchema = z.object({
  id: z.string(), // ThemeId on the wire; branded at the db/domain seam (themes slice)
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
  css: z.string().max(THEME_CSS_MAX).nullable(),
  isSeed: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Theme = z.infer<typeof themeSchema>;

export const createThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
  css: z.string().max(THEME_CSS_MAX).nullable().optional(),
});
export type CreateThemeInput = z.infer<typeof createThemeInputSchema>;

export const updateThemeInputSchema = createThemeInputSchema.partial();
export type UpdateThemeInput = z.infer<typeof updateThemeInputSchema>;
