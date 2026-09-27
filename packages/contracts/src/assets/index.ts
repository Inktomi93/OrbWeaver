// `@orb/contracts/assets` — the content-addressed asset WIRE: the upload `kind` axis, the upload POST
// response shape, and the `/blob/<hash>` route contract.
// Assets are per-user and owner-gated; the 64-hex hash is NOT a capability. The `/blob/:hash` route is
// app-gated: the caller resolves from the session cookie, never served on hash alone.

import type { AssetId, CharacterId, ChatId, GalleryItemId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The kinds of binary we content-address. `card` = a character-card PNG (also the avatar); `avatar` =
 *  a persona avatar; `export` = a future generated export (unwired in v1); `generated` = a model-generated
 *  image from a chat turn; `gallery` = a curated gallery image; `attachment` = a user-attached inline
 *  chat image or video (mp4/webm/gif, #317); `document` = a databank source document's original bytes; `background` = a user-uploaded
 *  decorative app background (pinned by the `appearance.backgroundAssetId` JSON field, GC-rooted
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

/** The URL for the `icon` (width-only, any-aspect) variant — the round/square avatar chrome's own rung.
 *  `?v=` is omitted because `icon` is the route's default variant kind; `width` is snapped SERVER-side to
 *  the fixed `BLOB_WIDTHS` ladder, so an off-rung ask is served at the next rung up rather than minting a
 *  new cache entry. Ask for the DEVICE pixels (the CSS box × the DPR you want to be sharp at), never the
 *  CSS box: a 24px avatar asking for 24 is blurry on every retina display. */
export function blobIconUrl(hash: string, width: number): string {
  return `${BLOB_ROUTE}/${hash}?w=${width}`;
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
  /** `false` if an index ROW for these bytes already existed (within-user content-addressed dedup, D21).
   *  The row, not the blob: a store that finds the blob already on disk but writes the missing row (crash
   *  recovery) is a creation — that is the flag the `asset.created` emit rides on. */
  created: boolean;
}

/** An `asset_…` TypeID at a request boundary — validates shape AND prefix (`typeIdSchema`). */
export const assetIdSchema = typeIdSchema(ID_PREFIX.asset) satisfies z.ZodType<AssetId>;
/** A `character_…` TypeID — the gallery `subjectCharacterId` association ref. */
export const characterIdSchema = typeIdSchema(ID_PREFIX.character) satisfies z.ZodType<CharacterId>;

/** The sha-256 hex digest length the CAS emits — 32 bytes, two hex chars each. */
const CAS_HASH_HEX_LENGTH = 64;

/** Parses {@link StoredAsset} — the client `uploadAsset` helper's response-boundary validator.
 *
 *  The floor matches what the producer can actually emit (#1371 item 5): `infra/storage/cas.ts` always
 *  returns a 64-char sha-256 hex and a real buffer length, so an empty hash or a negative size was a state
 *  no live path could reach and the schema accepted anyway. This is a RESPONSE validator over our own
 *  server's reply, not an input boundary — the tightening buys a louder failure if the reply ever stops
 *  being what the CAS promises, nothing more, and it is free. */
export const storedAssetSchema = z.object({
  assetId: assetIdSchema,
  hash: z.string().length(CAS_HASH_HEX_LENGTH),
  size: z.number().int().nonnegative(),
  created: z.boolean(),
}) satisfies z.ZodType<StoredAsset>;
/** A `gallery_item_…` TypeID — the gallery v2 curation row id. */
export const galleryItemIdSchema = typeIdSchema(ID_PREFIX.galleryItem) satisfies z.ZodType<GalleryItemId>;

/** Keyset page-size bounds (shared by `listOwned` + `listGallery`). */
export const ASSET_LIST_LIMIT_MIN = 1;
export const ASSET_LIST_LIMIT_MAX = 100;

/** One row of the owned-asset grid. `(uploadedAt, id)` is the keyset cursor. `animated` lets the grid
 *  render the ORIGINAL for GIF/APNG/animated-WebP instead of a `?w=` variant that would freeze-frame it.
 *
 *  TYPO class-B demotion: this was an infer-only `z.object` — a server→client OUTPUT shape nothing ever
 *  `.parse`s, so the schema was a type spelling wearing a validator's clothes. Hand-written here because
 *  the schema was the only source of the shape. */
export interface AssetListItem {
  readonly assetId: AssetId;
  readonly hash: string;
  readonly kind: AssetKind;
  readonly mime: string;
  readonly size: number;
  readonly uploadedAt: number;
  readonly animated: boolean;
}

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

/** `listGallery` wire params. `subjectCharacterId` omitted = the whole gallery. `chatId` narrows to the
 *  pictures generated in that room; it filters inside the owner scope and never widens it. */
export const galleryListParamsSchema = z.object({
  subjectCharacterId: characterIdSchema.optional(),
  chatId: (typeIdSchema(ID_PREFIX.chat) satisfies z.ZodType<ChatId>).optional(),
  limit: z.number().int().min(ASSET_LIST_LIMIT_MIN).max(ASSET_LIST_LIMIT_MAX),
  cursor: z.number().int().optional(),
  cursorId: galleryItemIdSchema.optional(),
});
export type GalleryListParams = z.infer<typeof galleryListParamsSchema>;

/** One curated gallery item. `hash`/`mime`/`animated` are joined from the `assets` row (owner derives
 *  through that FK — no stamped owner column).
 *
 *  TYPO class-B demotion (see {@link AssetListItem}): infer-only, never parsed — an output shape. */
export interface GalleryItemView {
  readonly galleryItemId: GalleryItemId;
  readonly assetId: AssetId;
  readonly hash: string;
  readonly mime: string;
  readonly animated: boolean;
  readonly subjectCharacterId: CharacterId | null;
  readonly createdAt: number;
}

// A message body stores its images as `asset:<id>` refs, but the blob route is keyed by hash, so the
// client resolves id → hash to build `blobUrl(hash)`.

/** `resolveBlobRefs` wire params — the asset ids a rendered message body references. Bounded to avoid
 *  an unbounded `IN (…)`. */
export const resolveBlobRefsParamsSchema = z.object({
  assetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX),
});
/** @public twin: resolveBlobRefsParamsSchema — the live `resolveBlobRefs` tRPC input (cross-package PUBLIC). */
export type ResolveBlobRefsParams = z.infer<typeof resolveBlobRefsParamsSchema>;

/** One resolved reference: the `(assetId, hash, mime)` identity slice plus the stored pixel dimensions.
 *  Only the caller's own assets come back; a foreign/gone id is simply absent (no leak). `mime` rides so
 *  the render side can pick the element (`video/*` → a native `<video>`, everything else `<img>`) without
 *  a second lookup — the same asset-owned media-kind fact the provider wire classifies on (#317).
 *
 *  TYPO class-B demotion (see {@link AssetListItem}): infer-only, never parsed — an output shape. The
 *  identity slice DERIVES rather than re-spelling `assetId`/`hash`/`mime`; the dimensions are declared
 *  here because only THIS projection needs them (the grid sizes its own tiles). */
export type AssetBlobRef = Pick<AssetListItem, "assetId" | "hash" | "mime"> & {
  /** Header-parsed intrinsic size, stored at upload (#625) — the render side reserves the true box with
   *  it BEFORE the bytes arrive. `null` when the asset is not an image or its header was unparseable
   *  (and on every row written before #625): the renderer falls back to its placeholder aspect. */
  readonly width: number | null;
  readonly height: number | null;
};

/** `resolveChatBlobRefs` wire params — the chat-scoped sibling of {@link resolveBlobRefsParamsSchema}
 *  so a co-participant (not just the owner) can render an inline attachment. The server resolves a pair
 *  only when the asset is structurally referenced in that chat AND both parties are present participants. */
export const resolveChatBlobRefsParamsSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  assetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX),
});
/** @public twin: resolveChatBlobRefsParamsSchema — the live `resolveChatBlobRefs` tRPC input (cross-package PUBLIC). */
export type ResolveChatBlobRefsParams = z.infer<typeof resolveChatBlobRefsParamsSchema>;

// ── The `assets-fsck` workload's terminal result (the workloads junk-drawer exit: a workload's result
//    shape is authored by the OWNING domain). ──

/** The read-only integrity walk's three fault counts — the REPORT is the product of the run. */
export interface FsckReport {
  readonly danglingRows: number;
  readonly corruptBlobs: number;
  readonly orphanBlobs: number;
}
