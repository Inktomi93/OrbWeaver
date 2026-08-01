// `@orb/contracts/assets` — the content-addressed asset WIRE: the upload `kind` axis, the upload POST
// response shape, and the `/blob/<hash>` route contract.
// Assets are per-user and owner-gated; the 64-hex hash is NOT a capability. The `/blob/:hash` route is
// app-gated: the caller resolves from the session cookie, never served on hash alone.

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The kinds of binary we content-address. `card` = a character-card PNG (also the avatar); `avatar` =
 *  a persona avatar; `export` = a future generated export (unwired in v1); `generated` = a model-generated
 *  image from a chat turn; `gallery` = a curated gallery image; `attachment` = a user-attached inline
 *  chat image; `document` = a databank source document's original bytes; `background` = a user-uploaded
 *  decorative app background (PD-131 — pinned by the `appearance.backgroundAssetId` JSON field, GC-rooted
 *  via the settings live-source scan, NOT an FK column); `plugin` = an installed plugin's bundle bytes.
 *  The db `assets.kind` enum derives from this tuple. */
export const ASSET_KINDS = ["card", "avatar", "export", "generated", "gallery", "attachment", "document", "background", "plugin"] as const;

export const assetKindSchema = z.enum(ASSET_KINDS);

export type AssetKind = z.infer<typeof assetKindSchema>;

/** The variant kinds `/api/blob/:hash` can produce. `icon` (an omitted `?v=` defaults to it) is the
 *  width-only ladder for round/square avatar chrome. `portrait` is the 2:3 smart-cropped, face-safe
 *  variant for VN/portrait immersive modes. `banner` is the 3:1 smart-cropped variant for header art —
 *  a genuinely different crop, never a CSS stretch. */
export const VARIANT_KINDS = ["icon", "portrait", "banner"] as const;

export const variantKindSchema = z.enum(VARIANT_KINDS);

export type VariantKind = z.infer<typeof variantKindSchema>;

/** The app route prefix that serves a content-addressed blob. App-gated: the served response is
 *  `Cache-Control: private, immutable` — a per-user cache, never `public`. */
export const BLOB_ROUTE = "/api/blob";

/** The URL the client uses to fetch a blob: `/api/blob/<hash>`. */
export function blobUrl(hash: string): string {
  return `${BLOB_ROUTE}/${hash}`;
}

/** The URL for the `portrait` (2:3 smart-cropped) variant. A sibling to {@link blobUrl}, not an option
 *  bag on it — existing avatar call sites pass a bare hash and must stay untouched. */
export function blobPortraitUrl(hash: string, width: number): string {
  return `${BLOB_ROUTE}/${hash}?v=portrait&w=${width}`;
}

/** The URL for the `banner` (3:1 smart-cropped) variant. */
export function blobBannerUrl(hash: string, width: number): string {
  return `${BLOB_ROUTE}/${hash}?v=banner&w=${width}`;
}

/** The response from `POST /api/assets/upload` — the persisted asset's identity. No `ownerId` on the
 *  wire — the uploader already owns it; the server stamps it from the `Principal`. */
export interface StoredAsset {
  assetId: AssetId;
  hash: string;
  size: number;
  /** `false` if the blob already existed (within-user content-addressed dedup, D21). */
  created: boolean;
}

/** An `asset_…` TypeID at a request boundary — validates shape AND prefix (`typeIdSchema`). */
export const assetIdSchema = typeIdSchema(ID_PREFIX.asset);
/** A `character_…` TypeID — the gallery `subjectCharacterId` association ref. */
export const characterIdSchema = typeIdSchema(ID_PREFIX.character);

/** Parses {@link StoredAsset} — the client `uploadAsset` helper's response-boundary validator. */
export const storedAssetSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string(),
  size: z.number().int(),
  created: z.boolean(),
});
/** A `gallery_item_…` TypeID — the gallery v2 curation row id. */
export const galleryItemIdSchema = typeIdSchema(ID_PREFIX.galleryItem);

/** Keyset page-size bounds (shared by `listOwned` + `listGallery`). */
export const ASSET_LIST_LIMIT_MIN = 1;
export const ASSET_LIST_LIMIT_MAX = 100;

/** One row of the owned-asset grid. `(uploadedAt, id)` is the keyset cursor. `animated` lets the grid
 *  render the ORIGINAL for GIF/APNG/animated-WebP instead of a `?w=` variant that would freeze-frame it. */
export const assetListItemSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string(),
  kind: assetKindSchema,
  mime: z.string(),
  size: z.number().int(),
  uploadedAt: z.number().int(),
  animated: z.boolean(),
});
export type AssetListItem = z.infer<typeof assetListItemSchema>;

/** `listOwned` wire params. `cursor`/`cursorId` are the `(uploadedAt, id)` pair of the previous page's
 *  last row — pass both or neither. */
export const listOwnedParamsSchema = z.object({
  kind: assetKindSchema.optional(),
  limit: z.number().int().min(ASSET_LIST_LIMIT_MIN).max(ASSET_LIST_LIMIT_MAX),
  cursor: z.number().int().optional(),
  cursorId: assetIdSchema.optional(),
});
export type ListOwnedParams = z.infer<typeof listOwnedParamsSchema>;

/** `addToGallery` wire params. Owner-only: the asset and — when given — the subject character must
 *  both be owned by the actor; enforced server-side. */
export const galleryAddParamsSchema = z.object({
  assetId: assetIdSchema,
  subjectCharacterId: characterIdSchema.optional(),
});
export type GalleryAddParams = z.infer<typeof galleryAddParamsSchema>;

/** `listGallery` wire params. `subjectCharacterId` omitted = the whole gallery. */
export const galleryListParamsSchema = z.object({
  subjectCharacterId: characterIdSchema.optional(),
  limit: z.number().int().min(ASSET_LIST_LIMIT_MIN).max(ASSET_LIST_LIMIT_MAX),
  cursor: z.number().int().optional(),
  cursorId: galleryItemIdSchema.optional(),
});
export type GalleryListParams = z.infer<typeof galleryListParamsSchema>;

/** One curated gallery item. `hash`/`mime`/`animated` are joined from the `assets` row (owner derives
 *  through that FK — no stamped owner column). */
export const galleryItemViewSchema = z.object({
  galleryItemId: galleryItemIdSchema,
  assetId: assetIdSchema,
  hash: z.string(),
  mime: z.string(),
  animated: z.boolean(),
  subjectCharacterId: characterIdSchema.nullable(),
  createdAt: z.number().int(),
});
export type GalleryItemView = z.infer<typeof galleryItemViewSchema>;

// A message body stores its images as `asset:<id>` refs, but the blob route is keyed by hash, so the
// client resolves id → hash to build `blobUrl(hash)`.

/** `resolveBlobRefs` wire params — the asset ids a rendered message body references. Bounded to avoid
 *  an unbounded `IN (…)`. */
export const resolveBlobRefsParamsSchema = z.object({
  assetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX),
});
export type ResolveBlobRefsParams = z.infer<typeof resolveBlobRefsParamsSchema>;

/** One resolved `(assetId, hash)` pair. Only the caller's own assets come back; a foreign/gone id is
 *  simply absent (no leak). */
export const assetBlobRefSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string(),
});
export type AssetBlobRef = z.infer<typeof assetBlobRefSchema>;

/** `resolveChatBlobRefs` wire params — the chat-scoped sibling of {@link resolveBlobRefsParamsSchema}
 *  so a co-participant (not just the owner) can render an inline attachment. The server resolves a pair
 *  only when the asset is structurally referenced in that chat AND both parties are present participants. */
export const resolveChatBlobRefsParamsSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  assetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX),
});
export type ResolveChatBlobRefsParams = z.infer<typeof resolveChatBlobRefsParamsSchema>;

// ── The `assets-fsck` workload's terminal result (the workloads junk-drawer exit: a workload's result
//    shape is authored by the OWNING domain). ──

/** The read-only integrity walk's three fault counts — the REPORT is the product of the run. */
export interface FsckReport {
  readonly danglingRows: number;
  readonly corruptBlobs: number;
  readonly orphanBlobs: number;
}
