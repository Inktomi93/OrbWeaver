// @orb/contracts/theme — the D44 §12.5 contracts home for theming: the `ThemeOverride` wire clamp
// (override.ts — the ONE wire copy of the §12.1 token subset) + the `Theme` entity shapes
// (the single-owned user theme library; the SERVER slice — table, verbs,
// seeding — is the unbuilt themes wave; these shapes land born-compliant so the D44 per-character
// theme column and the client `<ThemeScope>` consumers build against one home). A theme entity is
// its own module (not `/settings`): `ThemeOverride` has three unrelated consumers (the settings-
// homed entity, the character-row theme column, `<ThemeScope>`) — first-consumer misfiling is the
// `schema/search.ts` naming lie.

import { z } from "zod";
import { themeOverrideSchema } from "./override.ts";

export type { ThemeBackground } from "./background.ts";
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

/** Name/CSS length caps (named constants, shared with the future db CHECKs). */
export const THEME_NAME_MAX = 80;
export const THEME_CSS_MAX = 65_536; // custom CSS is a text field, not a blob store

/** The theme entity view. BOTH provenance flags DERIVE at projection — neither is a
 *  stored column. `isSeed` = a NULL owner: seeds are code-authored, non-deletable, duplicate-to-customize.
 *  `isDefault` = THIS row is the one `theme.selectedThemeId: null` resolves to — the base `@theme` ramp,
 *  which stamps no `[data-theme]` block. Exactly one row in a library carries it, and it is the client's
 *  ONLY handle on which row that is: the sentinel id that decides it is domain-internal by the ruling in
 *  `packages/server/src/domain/settings/constants.ts`, and identifying the row by its DISPLAY NAME instead
 *  is the #1667 defect this field exists to make impossible (one rename and the picker marks no card, or
 *  the wrong one). */
export const themeSchema = z.object({
  id: z.string(), // ThemeId on the wire; branded at the db/domain seam (themes slice)
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
  css: z.string().max(THEME_CSS_MAX).nullable(),
  isSeed: z.boolean(),
  isDefault: z.boolean(),
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
