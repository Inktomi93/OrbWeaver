// `@orb/contracts/settings/appearance` — the `UserSettings.appearance` section: its bounds, its vocabularies
// and its schema. The section's OWNER is still `settings` (the barrel re-exports every name here verbatim, so
// `@orb/contracts/settings` importers are untouched); this is a FILE split, never an ownership move.
//
// WHY IT IS ITS OWN FILE AND ITS OWN EXPORTS-MAP DOOR (#448). The client's pre-paint boot hint
// (`state/appearance-boot-hint.ts`, #231) re-validates its persisted blob through THIS schema rather than
// through a second copy of the bounds — that is the ab192aedf ruling and it stands. But `settings/index.ts`
// composes the whole `UserSettings` tree, which reaches `#prose`, `#preset`, `#rpg`, `#refinery` and their
// prose tables; zod construction is not statically pure, so `sideEffects: false` (#433) cannot shake those
// siblings out once the module is reached. Importing the section barrel for ONE schema therefore cost the
// boot chunk the entire prose corpus (~215 kB rendered). The schema lives here, `@orb/contracts` names
// `"./settings/appearance"` as an EXACT exports entry, and the boot hint reaches the contract's own schema
// object through a door whose graph is `#theme` + `@orb/kit/ids` + `#versioned-config` + zod. (That last
// one is the boot-critical leaf primitive itself — `@orb/kit/guards` + zod, no prose, no siblings; it is
// here for `tolerantArray`, the element-wise collection leaf the #471 write guard depends on.)
//
// The exports entry is exact, not a `"./*/*"` pattern, on purpose: the cake packages publish ONE door per
// domain (`"./*": "./src/*/index.ts"`), and a deep-file pattern would silently make every internal contracts
// module a public door with nothing to say so. `@orb/ui` is the house precedent for the enumerated form.
//
// Appearance (D44 §12.1) — DISPLAY-ONLY, never touches stored content (content-processing is preset
// territory, D53). Per-character COLOR theme layers on top; movingUI/waifuMode are OUT of scope here.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
// BG-C: the background source-kind vocabulary (`BACKGROUND_IMAGE_KINDS`) is homed in `#theme` (shared with
// the carried `ThemeBackground` twin); consumers import it from `@orb/contracts/theme`.
import { BACKGROUND_IMAGE_KINDS, THEME_CHAT_STYLES, THEME_DENSITIES } from "#theme";
import { tolerantArray } from "#versioned-config";

const CHAT_WIDTH_PCT_MIN = 30;
const CHAT_WIDTH_PCT_MAX = 100;
const CHAT_WIDTH_PCT_DEFAULT = 60;
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_DEFAULT = 1;
// THE WALLPAPER SCRIM HAS A FLOOR, AND THE FLOOR IS DERIVED (#487). `theme-background-layer.tsx` calls the
// scrim "mandatory … non-negotiable for text legibility"; a MIN of 0 made that sentence false — a legal
// setting rendered the guard at `opacity: 0` and handed the transcript's reading contrast to the user's
// picture (measured live pre-fix on `misty-highlands`: the plate's worst backdrop over its bright band
// read Y 0.0874 at dim 0 vs Y 0.0476 at 0.45).
//
// WHY A DIM FLOOR AND NOT A HEAVIER PLATE. D144(d) + the #217 rider rule the other arm OUT: "Inks are
// guaranteed vs their BASE, not worst-case art pixels — closing that would move the sacred dark rooms
// (owner-adjacent, refused)", and the dark plate's alpha is pinned at 0.65 because closing the same hole
// there needs 0.86. That ruling SURVIVES — its INPUT changed. `readingPlateAlpha` solves the plate against
// the worst LEGAL art, and until now raw art was legal; with a scrim floor the worst legal art is
// scrimmed art, so the guarantee lands without a pixel of the plate moving.
//
// THE NUMBER. Composite (worst legal art → `--color-backdrop` at `0.6 × dim` → `--color-reading-plate` at
// its palette alpha) and solve for the smallest dim at which each shipped palette's prose inks clear AA
// 4.5:1. Binding constraint: mocha `narration` over WHITE art at 0.442 (hearth narration 0.384, mocha
// dialogue 0.107); the light palette passes at every dim on both extremes, so nothing there moves. Stated
// at 0.45 because that is already `BACKGROUND_DIM_DEFAULT` — floor and default coincide, so an
// out-of-bounds stored value `.catch`es straight onto the floor and no lift migration exists to get wrong.
// `speaker` (the accent ink) is NOT in the guaranteed set: it needs dim 0.714, which is the same
// sacred-room move D144(d) refuses. Pinned by `tests/ui/content/theme-scope/palette-contrast.suite.test.ts`.
//
// EXPORTED (unlike its sibling bounds) because it is the one bound that carries a proven guarantee: the
// appearance panel's slider mirror (`client/features/app-shell/lib/appearance-bounds.ts`) takes THIS value
// rather than re-spelling it, so the control can never offer a dim the schema would clamp away.
export const BACKGROUND_DIM_MIN = 0.45;
const BACKGROUND_DIM_MAX = 1;
const BACKGROUND_DIM_DEFAULT = 0.45;
const BACKGROUND_BLUR_MIN = 0;
const BACKGROUND_BLUR_MAX = 24;
const BACKGROUND_BLUR_DEFAULT = 0;

export const BLUR_SURFACES = ["panels", "composer", "messages", "modals"] as const;
export type BlurSurface = (typeof BLUR_SURFACES)[number];
// The SHIPPED default of `appearance.blurSurfaces` (owner ruling 2026-08-02 — glass is on by default on
// the three chrome surfaces; it is also the `.catch` self-heal target, matching the sibling knobs).
// `messages` deliberately excluded — the Reading-Surface rule forbids blur behind long reading text by
// default; a user may still opt it in, and an explicitly-stored `[]` is a real opt-out that survives.
export const DEFAULT_BLUR_SURFACES: readonly BlurSurface[] = ["panels", "composer", "modals"];

// `asset` = an own-upload background (PD-131): the picked file is stored as a `background` AssetKind and
// pinned here by `backgroundAssetId` (GC-rooted via the settings live-source scan) + `backgroundAssetHash`
// (the immutable content hash the SYNC `resolveBackgroundUrl` builds `blobUrl(hash)` from — id↔hash is
// fixed for a content-addressed asset, so storing both is denormalized-but-never-stale). The source-kind
// vocabulary (`BACKGROUND_IMAGE_KINDS`) is homed in `#theme` (shared with the carried `ThemeBackground`
// twin — BG-C); consumers import it from `@orb/contracts/theme` directly.

export const SURFACE_TEXTURES = ["none", "grain"] as const;
export type SurfaceTexture = (typeof SURFACE_TEXTURES)[number];
export const APPEARANCE_BACKGROUND_FITS = ["cover", "contain", "stretch", "center"] as const;
export type AppearanceBackgroundFit = (typeof APPEARANCE_BACKGROUND_FITS)[number];

// A saved background-library entry (BG-D) — the per-user list of uploaded backgrounds the picker chooses
// from. Lives in settings (the backgrounds concept's ONE home, D63), NOT a relational table: a flat
// per-user list of dozens with names and zero relational joins. Every entry's `assetId` is GC-rooted by
// the settings live-source scan (`domain/assets/persistence/asset-refs.ts`) so an unpicked upload is never
// reaped. `mime` lets a picked VIDEO entry select the `<video>` background layer (BG-V) over the image one;
// `assetHash` builds `blobUrl(hash)` for the grid thumbnail without an async id→hash round-trip.
export const backgroundLibraryEntrySchema = z.object({
  // @orb-waive no-raw-id(entryId): not an entity FK — a blob-internal per-ROW ui identity, the SAME shape as the sibling client-minted blob-row ids (`regex.scripts[].id`, preset `sections[].id` — plain `crypto.randomUUID()`), and the sibling lenient UserSettings-tier `*Id` exemptions in this file. A branded kit/ids TypeID does NOT fit: the row is minted CLIENT-side (no client TypeID minter) and the v3→v4 backfill is DETERMINISTIC (`${assetId}:${index}`, so it's stable across the reads that re-run the lift before the first v4 write) — neither is a mintable `prefix_…` TypeID.
  // Stable per-ROW id, the key/select/delete/rename target (F-P2): a content-addressed `assetId` is SHARED by
  // byte-identical uploads, so keying rows on it collided (dup React keys + deleting one wiped both). `assetId`
  // stays the content pointer; `entryId` identifies the row.
  entryId: z.string(),
  assetId: typeIdSchema(ID_PREFIX.asset),
  assetHash: z.string(),
  mime: z.string(),
  name: z.string(),
  // Provenance for a materialized external-URL background (BG-C invariant / F-P0-2): the original URL the
  // asset was fetched-and-stored from. Optional (own-uploads have none); metadata only, never re-fetched.
  provenanceUrl: z.string().optional(),
});
export type BackgroundLibraryEntry = z.infer<typeof backgroundLibraryEntrySchema>;

const READING_LINE_HEIGHT_MIN = 1.2;
const READING_LINE_HEIGHT_MAX = 2.2;
const READING_LINE_HEIGHT_DEFAULT = 1.55;
const READING_LETTER_SPACING_MIN = -0.02;
const READING_LETTER_SPACING_MAX = 0.08;
const READING_LETTER_SPACING_DEFAULT = 0;
const READING_PARAGRAPH_SPACING_MIN = 0;
const READING_PARAGRAPH_SPACING_MAX = 3;
const READING_PARAGRAPH_SPACING_DEFAULT = 0.75;
const READING_NAME_SCALE_MIN = 0.8;
const READING_NAME_SCALE_MAX = 1.6;
const READING_BODY_SCALE_MIN = 0.8;
const READING_BODY_SCALE_MAX = 1.6;
const READING_SCALE_DEFAULT = 1;

const BLUR_STRENGTH_MIN = 4;
const BLUR_STRENGTH_MAX = 28;
const BLUR_STRENGTH_DEFAULT = 14;

/**
 * EXPORTED for the client's device-local BOOT HINT (#231): the hint replays a few appearance axes onto
 * `<html>` before React mounts, and a durable-local blob is untrusted input, so it is re-validated
 * through THIS schema rather than through a second set of bounds in the client. Every key here
 * `.catch()`es to its default, so `appearanceSettingsSchema.parse({})` is TOTAL — which is exactly the
 * "an invalid persisted state is DISCARDED, never trusted, never allowed to crash" posture the persisted
 * stores owe. Any other consumer still reads the parsed `UserSettings.appearance`, never this directly.
 */
export const appearanceSettingsSchema = z
  .object({
    chatWidthPct: z.number().int().min(CHAT_WIDTH_PCT_MIN).max(CHAT_WIDTH_PCT_MAX).catch(CHAT_WIDTH_PCT_DEFAULT).default(CHAT_WIDTH_PCT_DEFAULT),
    fontScale: z.number().min(FONT_SCALE_MIN).max(FONT_SCALE_MAX).catch(FONT_SCALE_DEFAULT).default(FONT_SCALE_DEFAULT),
    avatarSize: z.enum(["sm", "md", "lg"]).catch("md").default("md"),
    avatarShape: z.enum(["round", "square", "rounded"]).catch("round").default("round"),
    avatarAspect: z.enum(["square", "portrait"]).catch("square").default("square"),
    avatarRing: z.enum(["none", "accent"]).catch("none").default("none"),
    density: z.enum(THEME_DENSITIES).catch("comfortable").default("comfortable"),
    elevation: z.enum(["flat", "ramp", "glow"]).catch("flat").default("flat"),
    chatStyle: z.enum(THEME_CHAT_STYLES).catch("bubble").default("bubble"),
    showTimestamps: z.boolean().catch(true).default(true),
    showGenerationTimer: z.boolean().catch(false).default(false),
    // PD-137 — reveal a quiet per-message settled-cost affordance (a paid upstream OpenRouter call, fired
    // on-demand per message, never on load). Default OFF (opt-in, like the other diagnostic chips).
    showGenerationCost: z.boolean().catch(false).default(false),
    showTokenCount: z.boolean().catch(false).default(false),
    showMessageId: z.boolean().catch(false).default(false),
    showModelIcon: z.boolean().catch(false).default(false),
    showInChatAvatars: z.boolean().catch(true).default(true),
    messageActions: z.enum(["expanded", "hover"]).catch("hover").default("hover"),
    autoFixMarkdown: z.boolean().catch(false).default(false),
    // ST parity: imported cards carry their structure in quoted speech, which ST colors — default ON is
    // the ST-expat expectation. Paints the theme's `dialogueColor` (per-character themeOverride wins).
    colorQuotedSpeech: z.boolean().catch(true).default(true),
    // KEEPS its whole-collection self-heal, deliberately, against the #1365 sweep: an EMPTY set is itself a
    // meaningful stored value here ("blur nothing" — the opt-out documented at DEFAULT_BLUR_SURFACES), so
    // element-wise filtering of an unreadable `["fog"]` would FABRICATE a deliberate opt-out. The members
    // are a closed enum carrying no user content, so the reset costs a re-tick, not data.
    blurSurfaces: z
      .array(z.enum(BLUR_SURFACES))
      .catch([...DEFAULT_BLUR_SURFACES])
      .default([...DEFAULT_BLUR_SURFACES]),
    shadowEffects: z.boolean().catch(false).default(false),
    surfaceTexture: z.enum(SURFACE_TEXTURES).catch("none").default("none"),
    reducedMotion: z.boolean().catch(false).default(false),
    backgroundImageKind: z.enum(BACKGROUND_IMAGE_KINDS).catch("none").default("none"),
    // @orb-waive no-raw-id(backgroundSeededId): not an entity FK — a seeded-background CATALOG slug (matched against the static `listSeededBackgrounds()` set at render), so it stays a plain slug string; an empty/stale value degrades to "no image" at resolution.
    backgroundSeededId: z
      .string()
      .regex(/^[a-z0-9-]*$/u)
      .catch("")
      .default(""),
    // NOTE: there is no flat `backgroundExternalUrl` — an external URL can never paint (CSP `img-src`
    // self/data/blob only, by design), so the global appearance surface materializes a pasted URL server-side
    // (`settings.addExternalBackground`) into a `backgroundLibrary` ASSET entry rather than persisting a
    // paintable external field (the BG-C invariant, side-eye F-P0-2). The kind enum keeps `external` only as a
    // transient INPUT mode (the picker's URL-entry branch), never a persisted paintable state.
    // @orb-waive no-raw-id(backgroundAssetId): lenient UserSettings tier — the own-upload background asset id (kind `asset`). A stale/deleted value degrades to "no image" at resolution (the `profile.avatarAssetId` precedent); the LIVE value is GC-rooted by the settings live-source scan (`domain/assets/persistence/asset-refs.ts`), not an FK boundary.
    backgroundAssetId: z
      .string()
      .regex(/^(asset_[a-z0-9]+)?$/u)
      .catch("")
      .default(""),
    // The immutable content hash for the `asset` kind — the SYNC `resolveBackgroundUrl` builds
    // `blobUrl(hash)` from it (no async id→hash round-trip). A blank/garbage value degrades to a 404 blob.
    backgroundAssetHash: z.string().catch("").default(""),
    // BG-V: the mime of the picked `asset` background. App-shell branches the `<video>` background layer
    // over the image layer when this is `video/*`; blank (image assets / non-asset kinds) → the image layer.
    backgroundAssetMime: z.string().catch("").default(""),
    // BG-D: the saved background library the picker chooses from. Additive + prefaulted (an old blob reads
    // `[]` with no version bump — the persona/appearance precedent). Every entry's asset is GC-rooted.
    // ELEMENT-WISE (#1365, was a whole-array `.catch([])`): one malformed row dropped the ENTIRE library,
    // and because the catch made the parse succeed, `parseOutcome` said `intact: true`, so the #471 write
    // guard could not see it and the next unrelated settings save persisted the erasure. One bad row now
    // costs one row. (RECOVERY of a library already emptied by the old behaviour is NOT attempted here —
    // the bytes are gone from the blob; the assets themselves survive in the CAS and can be re-added.)
    backgroundLibrary: tolerantArray(backgroundLibraryEntrySchema, []).default([]),
    backgroundFit: z.enum(APPEARANCE_BACKGROUND_FITS).catch("cover").default("cover"),
    backgroundDim: z.number().min(BACKGROUND_DIM_MIN).max(BACKGROUND_DIM_MAX).catch(BACKGROUND_DIM_DEFAULT).default(BACKGROUND_DIM_DEFAULT),
    backgroundBlur: z.number().min(BACKGROUND_BLUR_MIN).max(BACKGROUND_BLUR_MAX).catch(BACKGROUND_BLUR_DEFAULT).default(BACKGROUND_BLUR_DEFAULT),
    readingLineHeight: z
      .number()
      .min(READING_LINE_HEIGHT_MIN)
      .max(READING_LINE_HEIGHT_MAX)
      .catch(READING_LINE_HEIGHT_DEFAULT)
      .default(READING_LINE_HEIGHT_DEFAULT),
    readingLetterSpacing: z
      .number()
      .min(READING_LETTER_SPACING_MIN)
      .max(READING_LETTER_SPACING_MAX)
      .catch(READING_LETTER_SPACING_DEFAULT)
      .default(READING_LETTER_SPACING_DEFAULT),
    readingParagraphSpacing: z
      .number()
      .min(READING_PARAGRAPH_SPACING_MIN)
      .max(READING_PARAGRAPH_SPACING_MAX)
      .catch(READING_PARAGRAPH_SPACING_DEFAULT)
      .default(READING_PARAGRAPH_SPACING_DEFAULT),
    readingNameScale: z.number().min(READING_NAME_SCALE_MIN).max(READING_NAME_SCALE_MAX).catch(READING_SCALE_DEFAULT).default(READING_SCALE_DEFAULT),
    readingBodyScale: z.number().min(READING_BODY_SCALE_MIN).max(READING_BODY_SCALE_MAX).catch(READING_SCALE_DEFAULT).default(READING_SCALE_DEFAULT),
    justifyBodyText: z.boolean().catch(false).default(false),
    enableThemeColorization: z.boolean().catch(false).default(false),
    blurStrength: z.number().min(BLUR_STRENGTH_MIN).max(BLUR_STRENGTH_MAX).catch(BLUR_STRENGTH_DEFAULT).default(BLUR_STRENGTH_DEFAULT),
    showLLMReasoningIcon: z.boolean().catch(false).default(false),
  })
  .prefault({});

export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;
