// @orb/contracts/theme — the D44 §12.5 contracts home for theming: the `ThemeOverride` wire clamp
// (override.ts — the ONE wire copy of the §12.1 token subset) + the `Theme` entity shapes
// (themes-design.md §3.2 — the single-owned user theme library; the SERVER slice — table, verbs,
// seeding — is the unbuilt themes wave; these shapes land born-compliant so the D44 per-character
// theme column and the client `<ThemeScope>` consumers build against one home). A theme entity is
// its own module (not `/settings`): `ThemeOverride` has three unrelated consumers (the settings-
// homed entity, the character-row theme column, `<ThemeScope>`) — first-consumer misfiling is the
// `schema/search.ts` naming lie (themes-design §3.1).

import { z } from "zod";
import { themeOverrideSchema } from "./override.ts";

export type { BackgroundImageKind, ThemeBackground } from "./background.ts";
export { BACKGROUND_IMAGE_KINDS, canonicalBackgroundSource, themeBackgroundSchema } from "./background.ts";
export type {
  BackgroundMaterializeFailure,
  MaterializeBackgroundOp,
  MaterializeBackgroundResult,
  MaterializedBackgroundAsset,
} from "./materialize.ts";
export { BACKGROUND_MATERIALIZE_FAILURES, backgroundMaterializeMessage } from "./materialize.ts";
export type {
  CardEmbeddableTheme,
  CardEmbeddableThemeKey,
  ThemeChatStyle,
  ThemeDensity,
  ThemeFont,
  ThemeKeyReach,
  ThemeOverride,
  ThemeRadius,
  ViewerSacredThemeKey,
} from "./override.ts";
export {
  CARD_EMBEDDABLE_THEME_KEYS,
  cardEmbeddableSubset,
  THEME_CHAT_STYLES,
  THEME_DENSITIES,
  THEME_FONT_ALLOWLIST,
  THEME_KEY_REACHES,
  THEME_RADII,
  themeOverrideSchema,
  VIEWER_SACRED_THEME_KEYS,
} from "./override.ts";
export type { SeededBackground } from "./seeded-backgrounds.ts";
export { listSeededBackgrounds, resolveSeededBackgroundUrl } from "./seeded-backgrounds.ts";

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

/** PROMOTE a character card's authored look into the picker library (TD door 1). Values are COPIED, never
 *  referenced: the card's override IS values (no FK to `themes` exists), the roster wire threads those
 *  values to every member, and a ref would dangle when the theme is deleted. The verb projects the payload
 *  through `cardEmbeddableSubset` (a promoted theme must not smuggle a viewer-force the card itself could
 *  not exert) and DE-COLLIDES the name at the mint — this door supplies a default the user never typed
 *  (the character's name), so "Aria 2" is the honest outcome where `createTheme`'s explicit-name editor
 *  path correctly throws a typed conflict instead. No `css`: cards have no CSS tier. */
export const promoteThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
});
export type PromoteThemeInput = z.infer<typeof promoteThemeInputSchema>;
