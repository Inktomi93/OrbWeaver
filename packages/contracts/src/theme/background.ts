// The carried-background SOURCE schema (BG-C) — the `ThemeOverride` TWIN: a per-character / per-chat
// decorative-background POINTER that, in a true-solo room, takes over the app-root background layer. Only
// the picture SOURCE is carried (kind + the per-kind reference); fit / dim / blur stay the VIEWER's own
// `appearance` treatment (ST `/lockbg` semantics — the chat locks the image, never the viewer's dimming).
//
// INVARIANT — `kind:"external"` is an INPUT-ONLY transient, never a persisted PAINTABLE state (side-eye
// F-P0-2): a raw external URL can never paint (the CSP `img-src` allows only self/data/blob, by design), so
// every background WRITE path materializes an incoming `external` source server-side (safeFetch → image
// magic-belt → CAS) into a `kind:"asset"` source carrying the original URL as `provenanceUrl`, OR refuses
// with a typed error the caller toasts. NO write path persists a live external URL for painting; the URL
// resolvers therefore carry NO `external` arm (a stray persisted `external` degrades to "no image").
//
// `BACKGROUND_IMAGE_KINDS` is homed HERE (not `/settings`): the source-kind vocabulary is shared by the
// viewer's flat `appearance` background fields AND this carried twin, and `settings` already depends on
// `theme` (one-directional — `theme` cannot import `settings`). `settings` re-exports it, so the flat
// appearance fields and every settings consumer keep the one name.
//
// Fault isolation: every field is lenient (`.catch`/`.default`) so a malformed carried blob heals to
// `kind:"none"` (⇒ the viewer's own appearance wins) rather than throwing — the `themeOverrideSchema` and
// `parseChatMetadata` posture.

import { z } from "zod";

/** The decorative-background source kind — the ONE home (viewer `appearance` + the carried twin). `asset`
 *  is an own-upload pinned by `assetId`/`assetHash` (GC-rooted via the asset-refs JSON live-sources for
 *  each carried location); `seeded` a static catalog slug; `external` a URL. */
export const BACKGROUND_IMAGE_KINDS = ["none", "seeded", "external", "asset"] as const;
export type BackgroundImageKind = (typeof BACKGROUND_IMAGE_KINDS)[number];

/** The carried decorative-background SOURCE (BG-C) — a `ThemeOverride` twin. Source-only: fit/dim/blur are
 *  never carried (the viewer keeps their own appearance treatment). `kind:"none"` (or an empty ref for the
 *  active kind) resolves to "no override" ⇒ the viewer's own background wins. Field naming mirrors the flat
 *  `appearance` background fields minus the `background` prefix (`kind`, not `backgroundImageKind`). */
export const themeBackgroundSchema = z.object({
  kind: z.enum(BACKGROUND_IMAGE_KINDS).catch("none").default("none"),
  // @orb-gate-ignore no-raw-id: not an entity FK — a seeded-background CATALOG slug (matched against the static `listSeededBackgrounds()` set at render), so it stays a plain slug string; an empty/stale value degrades to "no image" at resolution. The TWIN of settings/index.ts `backgroundSeededId`, which carries the same granted exemption. ENDS WHEN: seeded backgrounds become a real owned entity with minted ids.
  seededId: z
    .string()
    .regex(/^[a-z0-9-]*$/u)
    .catch("")
    .default(""),
  externalUrl: z
    .string()
    .refine((s) => s === "" || z.url().safeParse(s).success)
    .catch("")
    .default(""),
  // @orb-gate-ignore no-raw-id: the own-upload background asset id (kind `asset`). A stale/deleted value degrades to "no image" at resolution; the LIVE value is GC-rooted by the asset-refs JSON live-source for the carried location (character.background_override / chats.metadata.background), never an FK boundary — and the lenient `""` empty sentinel no branded typeIdSchema can express. The TWIN of settings/index.ts `backgroundAssetId`, which carries the same granted exemption. ENDS WHEN: the carried blob stops using `""` for "unset" and can hold a nullable branded AssetId.
  assetId: z
    .string()
    .regex(/^(asset_[a-z0-9]+)?$/u)
    .catch("")
    .default(""),
  // The immutable content hash for the `asset` kind — the SYNC url resolver builds `blobUrl(hash)` from it.
  assetHash: z.string().catch("").default(""),
  // The `asset` mime — the app-shell branches the `<video>` background layer over the image layer when this
  // is `video/*` (the BG-V axis); blank (image assets / non-asset kinds) ⇒ the image layer.
  mime: z.string().catch("").default(""),
  // Provenance for a MATERIALIZED background (the INVARIANT above): the original external URL an `asset`
  // source was fetched-and-stored from, kept as metadata (never re-fetched — the bytes live in the CAS). Only
  // meaningful on `kind:"asset"`; `canonicalBackgroundSource` empties it for every other kind. Additive +
  // lenient (an old blob reads "" — no version bump; the carried twin is not a versioned-config tier).
  provenanceUrl: z.string().catch("").default(""),
});
export type ThemeBackground = z.infer<typeof themeBackgroundSchema>;

/** Canonicalize a parsed background SOURCE to its GC-safe persisted shape: ONLY `kind:"asset"` may carry an
 *  asset reference, so any non-asset kind's `assetId`/`assetHash`/`mime` are forced empty. Without this a
 *  `kind:"none"` (or `seeded`/`external`) payload carrying a populated `assetId` would smuggle that id past
 *  the ownership gate (which keys on `kind:"asset"`) and into the metadata JSON, where the GC live-source
 *  scans root it unconditionally — pinning an arbitrary/foreign asset. ONE home so every carried-background
 *  write path (chat metadata + character card) persists the identical clean shape. Idempotent. */
export function canonicalBackgroundSource(bg: ThemeBackground): ThemeBackground {
  return bg.kind === "asset" ? bg : { ...bg, assetId: "", assetHash: "", mime: "", provenanceUrl: "" };
}
