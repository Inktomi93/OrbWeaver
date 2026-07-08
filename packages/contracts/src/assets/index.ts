// `@orb/contracts/assets` — the content-addressed asset WIRE: the upload `kind` axis, the upload POST
// response shape, and the `/blob/<hash>` route contract. Cross-boundary: the client builds blob URLs +
// reads the upload result, the server/caddy serve the route, and the db `assets.kind` enum derives from
// the SAME `ASSET_KINDS` tuple. ONE home (§7.5 `no-inline-union-redecl`): the kind union was re-spelled
// inline across the db enum, the upload-route validation, the client `uploadAsset` helper, and the neo
// `shared/_kit/assets.ts` type — all collapse here. The pure hash GUARD (`isAssetHash`) is a leaf
// primitive in `@orb/kit/assets` (NOT re-exported); the variant-width ladder (`BLOB_WIDTHS` /
// `snapBlobWidth`) is domain POLICY (`domain/assets/substrate`), NOT a contract. Ported from neo-tavern
// `shared/_kit/assets.ts` (the wire parts) + `client/lib/assets.ts` (whose hand-redeclared
// `UploadedAsset` collapses into `StoredAsset`).
//
// D21 — assets are PER-USER (single-owned) and owner-gated; the 64-hex hash is NOT a capability
// (reverses the neo "unauthenticated, hash = capability, `public` cache" model). The `/blob/:hash` route
// is APP-gated: the caller is resolved from the same-origin session cookie → `fetchOwned` (or the narrow
// roster-avatar membership exception) → serve or 404. caddy skips forward-auth on this prefix so an
// `<img>` GET isn't 302-bounced to login, but the app is the gate — hence the route is the app path
// (`/api/blob`), and the served response carries `Cache-Control: private, immutable` (a per-user cache,
// never `public`).

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── The upload `kind` axis (ONE home; db enum + route + client all derive from this tuple) ───────────

/** The kinds of binary we content-address. `card` = a character-card PNG (also the avatar); `avatar` =
 *  a persona avatar; `export` = a future generated export (declared intent — the export-blob write path
 *  is unwired in v1, kept per "unwired ≠ worthless"); `generated` = a model-generated image stored from a
 *  chat `generateImage` turn (D47 #1 — the chat caller; the `imagery` orchestrator is Phase 7); `gallery` =
 *  a curated gallery image (gallery v2); `attachment` = a user-attached inline chat image (distinct from
 *  `generated`/`gallery`/`card` so `listOwned` can filter it). The db `assets.kind` enum derives from this
 *  tuple. */
export const ASSET_KINDS = [
  "card",
  "avatar",
  "export",
  "generated",
  "gallery",
  "attachment",
] as const;

export const assetKindSchema = z.enum(ASSET_KINDS);

export type AssetKind = z.infer<typeof assetKindSchema>;

// ── The variant KIND axis (ONE home; the `?v=` blob-route query param + the domain ladder selector +
//    the client URL builder all derive from this tuple) ────────────────────────────────────────────────

/** The variant kinds `/api/blob/:hash` can produce. `icon` (the floor — an omitted `?v=` defaults to it)
 *  is the existing width-only ladder (`BLOB_WIDTHS`, any source aspect, no crop) for round/square avatar
 *  chrome. `portrait` is the 2:3 smart-cropped (sharp `position:'attention'`, face-safe) variant for the
 *  fixed-box VN/portrait immersive modes (`FINAL-Persona-and-Immersive-Chat-Visuals.md` §B.4) — its own
 *  ladder (`domain/assets/substrate/variant-policy` `PORTRAIT_WIDTHS`) so it never collides with the icon
 *  cache keyspace. `banner` is the 3:1 smart-cropped variant for Whisper's header-art band (the immersive
 *  chatStyle redo) — its own ladder (`BANNER_WIDTHS`), a genuinely different crop from `portrait`, never a
 *  CSS stretch of an arbitrary-aspect source. */
export const VARIANT_KINDS = ["icon", "portrait", "banner"] as const;

export const variantKindSchema = z.enum(VARIANT_KINDS);

export type VariantKind = z.infer<typeof variantKindSchema>;

// ── The `/blob/<hash>` route contract (D21 owner-gated) ──────────────────────────────────────────────

/** The app route prefix that serves a content-addressed blob. APP-gated (D21): the caller is resolved
 *  from the same-origin session cookie and `fetchOwned` BEFORE serve — the hash is NOT a capability.
 *  caddy skips forward-auth on this prefix (so an `<img>` GET isn't 302-bounced to login), but the app is
 *  the gate; the served response is `Cache-Control: private, immutable` (a per-user cache, never the neo
 *  `public`). The path is the app path (`/api/blob`), not a caddy-direct static path. */
export const BLOB_ROUTE = "/api/blob";

/** The URL the client uses to fetch a blob: `/api/blob/<hash>`. Pure string compose (no I/O) — the
 *  format/path-traversal guard `isAssetHash` (`@orb/kit/assets`) is applied server-side at path
 *  construction, and ownership is the real authz (D21). Display transforms (`?w=` / `?f=webp`, the avatar
 *  size ladder) are a CLIENT concern layered on top of this canonical route. */
export function blobUrl(hash: string): string {
  return `${BLOB_ROUTE}/${hash}`;
}

/** The URL for the `portrait` (2:3 smart-cropped) variant: `/api/blob/<hash>?v=portrait&w=<px>`. A
 *  sibling to {@link blobUrl}, not an option bag on it — the existing 5 avatar call sites pass a bare
 *  hash and must stay untouched; portrait is its own opt-in shape (client consumption is Phase 4 of
 *  `FINAL-Persona-and-Immersive-Chat-Visuals.md` §B.4 — this helper only proves the route is reachable). */
export function blobPortraitUrl(hash: string, width: number): string {
  return `${BLOB_ROUTE}/${hash}?v=portrait&w=${width}`;
}

/** The URL for the `banner` (3:1 smart-cropped) variant: `/api/blob/<hash>?v=banner&w=<px>`. Whisper's
 *  header-art band consumes this — a genuinely wide, face-safe crop, never a `background-size` stretch of
 *  the plain original (the Phase-4 squish defect this variant + helper replace). */
export function blobBannerUrl(hash: string, width: number): string {
  return `${BLOB_ROUTE}/${hash}?v=banner&w=${width}`;
}

// ── The upload POST response (collapses the client's hand-redeclared `UploadedAsset`) ────────────────

/** The response from `POST /api/assets/upload` — the persisted asset's identity. The client redeclared
 *  this as `UploadedAsset` (with an unbranded `assetId: string`); collapsed here to the ONE shape with a
 *  branded {@link AssetId} (the client casts at its consumer seam). No `ownerId` on the wire — the
 *  uploader already owns it; D21 stamps `ownerId` from the `Principal` server-side. */
export interface StoredAsset {
  assetId: AssetId;
  hash: string;
  size: number;
  /** `false` if the blob already existed (within-user content-addressed dedup, D21). */
  created: boolean;
}

// ── Branded-id boundary schemas (prefix-validating; the wire's id fields derive from these) ────────────

/** An `asset_…` TypeID at a request boundary — validates shape AND prefix (`typeIdSchema`). */
export const assetIdSchema = typeIdSchema(ID_PREFIX.asset);
/** A `character_…` TypeID — the gallery `subjectCharacterId` association ref. */
export const characterIdSchema = typeIdSchema(ID_PREFIX.character);

/** Parses {@link StoredAsset} — the client `uploadAsset` helper's response-boundary validator (the raw
 *  `POST /api/assets/upload` JSON is untrusted until parsed, same posture as every other wire read). */
export const storedAssetSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string(),
  size: z.number().int(),
  created: z.boolean(),
});
/** A `gallery_item_…` TypeID — the gallery v2 curation row id. */
export const galleryItemIdSchema = typeIdSchema(ID_PREFIX.galleryItem);

// ── Gallery v1: `listOwned` — the owned-asset grid read (gallery-design §1.2) ──────────────────────────

/** Keyset page-size bounds (shared by `listOwned` + `listGallery`); extracted per `noMagicNumbers`. */
export const ASSET_LIST_LIMIT_MIN = 1;
export const ASSET_LIST_LIMIT_MAX = 100;

/** One row of the owned-asset grid. `hash` → `blobUrl(hash)` + `?w=` for the thumbnail; `(uploadedAt, id)`
 *  is the keyset cursor the client derives the next page from (both fields are on the view → the return
 *  type stays a plain array, no page envelope — §1.2). NO `animated`: deferred to G2 (the grid that needs
 *  the animated bailout is Phase 6; adding it now means a byte-sniff + an `assets` column with no consumer). */
export const assetListItemSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string(),
  kind: assetKindSchema,
  mime: z.string(),
  size: z.number().int(),
  uploadedAt: z.number().int(),
});
export type AssetListItem = z.infer<typeof assetListItemSchema>;

/** `listOwned` wire params (the acting principal is server-side, NOT on the wire). `limit` is bounded
 *  1..100; `cursor`/`cursorId` are the `(uploadedAt, id)` pair of the previous page's last row — pass both
 *  or neither (§1.2 keyset contract). */
export const listOwnedParamsSchema = z.object({
  kind: assetKindSchema.optional(),
  limit: z.number().int().min(ASSET_LIST_LIMIT_MIN).max(ASSET_LIST_LIMIT_MAX),
  cursor: z.number().int().optional(),
  cursorId: assetIdSchema.optional(),
});
export type ListOwnedParams = z.infer<typeof listOwnedParamsSchema>;

// ── Gallery v2: curated per-character media (gallery-design §1.3) ──────────────────────────────────────

/** `addToGallery` wire params. Owner-only posture (§1.3 `can()`): the asset AND — when given — the subject
 *  character must both be owned by the actor; enforced server-side. */
export const galleryAddParamsSchema = z.object({
  assetId: assetIdSchema,
  subjectCharacterId: characterIdSchema.optional(),
});
export type GalleryAddParams = z.infer<typeof galleryAddParamsSchema>;

/** `listGallery` wire params. `subjectCharacterId` omitted = the whole gallery; keyset is `(createdAt, id)`
 *  — the same two-field contract as §1.2, but over `gallery_items`. */
export const galleryListParamsSchema = z.object({
  subjectCharacterId: characterIdSchema.optional(),
  limit: z.number().int().min(ASSET_LIST_LIMIT_MIN).max(ASSET_LIST_LIMIT_MAX),
  cursor: z.number().int().optional(),
  cursorId: galleryItemIdSchema.optional(),
});
export type GalleryListParams = z.infer<typeof galleryListParamsSchema>;

/** One curated gallery item. `hash`/`mime` are joined from the `assets` row (owner derives through that FK
 *  — no stamped owner column). NO `animated`: deferred to G2 (same reason as {@link assetListItemSchema}). */
export const galleryItemViewSchema = z.object({
  galleryItemId: galleryItemIdSchema,
  assetId: assetIdSchema,
  hash: z.string(),
  mime: z.string(),
  subjectCharacterId: characterIdSchema.nullable(),
  createdAt: z.number().int(),
});
export type GalleryItemView = z.infer<typeof galleryItemViewSchema>;
