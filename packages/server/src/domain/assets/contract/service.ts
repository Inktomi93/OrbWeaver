// domain/assets/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • AssetsContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts, mirroring
//                     every other domain). The bundle is ASSEMBLED at the entry composition root and
//                     handed to `createAssetsService`; assets sideways-imports none of its deps
//                     (domain-no-cross-feature — infra handles + the event op arrive type-only here).
//   • AssetsService   the verb interface (the front door re-exports the type).
//
// SCOPE: the upload/fetch/variant core path — `store` (+ the `asset.created` emit), `getMetadata` (the
// owner-gated blob-serve gate), `resolveVariant` (the snap → cache → transform variant pipeline) — plus the
// gallery verbs AND the maintenance/DR wave (PD-26 + PD-84): `backfillAvatars` · `collectGarbage` ·
// `reapIfOrphan` · `fsck` · `rebuildFromTree`, over the asset-ref registry (`persistence/asset-refs.ts`) +
// the drop-row-before-blob primitive (`substrate/purge-asset.ts`). The maintenance verbs are UN-PRINCIPAL
// (CLI/workload/DR callers, not user-facing); their param/result types are domain-internal
// (`contract/maintenance.ts`). As-built rationale: `docs/architecture/history/assets-maintenance.md`.
//
// Every surface is OWNER-SCOPED off `principal.userId` (§7.1 — never a `users` read; the
// `no-direct-users-read` chokepoint). Assets predate the permission model: there is NO admin/owner guard
// in the bundle (D21 — access control is at the asset itself via `fetchOwned`, not a privileged surface).

import type { EmitDomainEvent } from "@orb/contracts/events";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, ChatId, GalleryItemId, UserId } from "@orb/kit/ids";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas, VariantCache } from "#infra/storage";
import type {
  BackfillParams,
  BackfillResult,
  FsckOptions,
  FsckResult,
  GcOptions,
  GcResult,
  ReapResult,
  RebuildOptions,
  RebuildResult,
} from "./maintenance";
import type {
  GalleryAddParams,
  GalleryListParams,
  GetMetadataParams,
  ListOwnedParams,
  RemoveFromGalleryParams,
  ResolveVariantParams,
  StoreParams,
} from "./params";
import type { AssetCasRef, AssetMetadata, StoredAsset } from "./results";
import type { AssetBlobRef, AssetListItem, GalleryItemView } from "./views";

/**
 * The DI bundle every assets verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all DB access routes through `persistence/`).
 *   - `cas` — the per-user content-addressed BYTE store (`infra/storage`, injected DOWN). The domain owns
 *     the index row; the bytes live here; `storeBlob` keeps the pair coherent.
 *   - `variants` — the derived-webp cache (`infra/storage`). OPTIONAL: a caller that never serves variants
 *     (a DR/rebuild env) omits it; `resolveVariant` degrades to recompute-every-time without caching.
 *   - `imageTransform` — the `sharp` adapter op (`infra/image`, D6). The width is already snapped by the
 *     domain's `variant-policy`; this op decodes → resizes → re-encodes (and strips all metadata).
 *   - `emit` — the injected domain-event op (`@orb/contracts/events`). `store` emits `asset.created`; the
 *     domain has ZERO knowledge of subscribers (the embeddings indexer subscribes at the root).
 *   - `now` — the INJECTED clock (epoch-ms). Stamps `assets.uploadedAt` + the CAS mtime touch; no ambient
 *     `Date.now()` in a verb (determinism — `test-determinism`).
 *   - `newAssetId` — the INJECTED id minter. No ambient `mintTypeId()` in a verb (the same seam).
 */
export interface AssetsContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants?: VariantCache;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  readonly emit: EmitDomainEvent;
  readonly now: () => number;
  readonly newAssetId: () => AssetId;
  /** The INJECTED gallery-item id minter (gallery v2). No ambient `mintTypeId()` in a verb (the same
   *  determinism seam as `newAssetId`). */
  readonly newGalleryItemId: () => GalleryItemId;
  /**
   * (PD-28 / D21, amended 2026-07-07) Roster-avatar REFERENCE-CHECK — NOT a hash→any-owner oracle
   * (PD-107). Given the CALLER's userId and a blob hash, returns the `assets.ownerId` of that hash ONLY IF
   * it is the `avatarAssetId` of EITHER (a) a CHARACTER rostered (`kind='character'`, present) in a chat
   * where the caller is a PRESENT member, OR (b) a PERSONA that is a present HUMAN co-participant's CURRENT
   * `activePersonaId` in a chat where the caller is ALSO a present member (the multi-human group sibling
   * case — a co-participant's OWN persona avatar), OR (c) an ATTACHMENT: the hash is an asset STRUCTURALLY
   * referenced by a `message_assets` row for a message in a chat where the caller is PRESENT and the asset's
   * OWNER is also PRESENT (#67 co-participant render — the blob-serve sibling of {@link loadChatAssetRefs},
   * so a hash the render resolver hands a co-participant actually fetches). `undefined` otherwise (a
   * co-participant's non-avatar / non-attached asset, an identity outside the caller's chats, a left
   * caller/identity/owner all miss on every arm). Returns the ASSET owner (the CAS-partition key for the
   * downstream bytes read), never a bare-hash existence signal. Optional — absent on non-HTTP/DR/workload
   * callers that never need the roster gate. (Sprite-set widening is deferred — PD-56.)
   */
  readonly loadCoParticipantOwner?: (callerId: UserId, hash: string) => Promise<UserId | undefined>;
  /**
   * (#67 co-participant render — D21 chat-scoped RENDER resolver, wired at the entry root) Resolve the
   * `(assetId, hash)` pairs among `assetIds` a caller may RENDER in `chatId`, by the SAME reference-check
   * discipline as {@link loadCoParticipantOwner} (NOT a hash / ownership oracle). A pair is returned ONLY IF
   * (a) the asset has a `message_assets` row for a message IN `chatId` (the STRUCTURAL reference — membership
   * alone is NOT sufficient), (b) the asset's owner is a PRESENT participant of `chatId`, AND (c) the CALLER
   * is a PRESENT participant of `chatId`. An id missing a structural reference in this chat, owned by a
   * non-present user, or requested by a non-present caller is simply absent (no leak). Mirrors
   * `entry/compose/resolve-image-ref.ts`'s model-path gate exactly. Optional — absent on non-HTTP/DR/workload
   * callers that never render a chat.
   */
  readonly loadChatAssetRefs?: (
    callerId: UserId,
    chatId: ChatId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;
  /**
   * Gallery owner-only posture (§1.3 `can()`): does `ownerId` own `characterId`? Wired at the entry root
   * as a direct owner-scoped `characters` read (assets never sideways-imports the character domain — the
   * check arrives as an injected op, the same seam as `loadCoParticipantOwner`). Optional — absent on
   * non-HTTP/DR/workload callers that never call `addToGallery`; when absent, `addToGallery` gates on the
   * asset ONLY and skips the subject-character check (documented degradation).
   */
  readonly assertCharacterOwned?: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
  /**
   * Gallery EXPORT re-link (export-import-portability.md §1): the `handle` of a character by id, or null when
   * the character is gone. The gallery serde carries the subject character's HANDLE, not the raw
   * `subjectCharacterId` (ids are not preserved across a fresh box); this resolves each row's subject id to
   * its portable handle. Wired at the entry root as a direct owner-agnostic `characters.handle` read (assets
   * never sideways-imports the character domain — the same injected-op seam as `assertCharacterOwned`).
   * Optional — absent on non-portability callers; when absent, `exportGallery` degrades every item to an
   * un-charactered (null-handle) row.
   */
  readonly resolveCharacterHandle?: (characterId: CharacterId) => Promise<string | null>;
  /**
   * Gallery IMPORT re-link (PD-108 handle oracle): the owner's OWN character id carrying `handle`, or null
   * when no such character exists on this box. Wired at the entry root to the SAME owner-scoped
   * `character.findByHandle` read the card importer + default-card seeder already inject (the PD-108 seam —
   * NOT a parallel lookup). Optional — absent on non-portability callers; when absent (or when a handle does
   * not resolve), `importGallery` writes the item UN-CHARACTERED (`subjectCharacterId = null`, matching the
   * schema's SET NULL).
   */
  readonly findCharacterByHandle?: (args: {
    readonly ownerId: UserId;
    readonly handle: string;
  }) => Promise<CharacterId | null>;
}

export interface AssetsService {
  /** Persist bytes to the owner's CAS + upsert the index row (the coherence pair). Returns the stored
   *  identity; `created:false` when the same bytes already existed for this owner (within-user dedup,
   *  D21). Emits `asset.created` only on a genuinely new asset. `enforceMagic` (the upload boundary
   *  passes `true`) verifies the claimed mime against the byte signature before anything reaches CAS. */
  readonly store: (params: StoreParams) => Promise<StoredAsset>;
  /** The blob-serve gate: the `{mime,size}` of an asset the CALLER owns, or `undefined` (→ 404) when it
   *  doesn't exist OR isn't theirs (the two collapse — no foreign-existence leak). Owner-scoped off
   *  `principal.userId`. The route resolves the caller (session cookie) then calls this BEFORE serving. */
  readonly getMetadata: (params: GetMetadataParams) => Promise<AssetMetadata | undefined>;
  /** Resolve a resized-webp variant of an owned blob: snap the requested width to the ladder → cache-read
   *  → on miss, transform the owner's CAS original via the injected `imageTransform` and cache it. Returns
   *  the webp bytes, or `undefined` (→ 404) for a non-hash, an off-ladder width, or a blob the caller
   *  doesn't own (per-user CAS keying is the physical gate). */
  readonly resolveVariant: (params: ResolveVariantParams) => Promise<Uint8Array | undefined>;
  /** The image-embed canon re-reader: the CAS bytes of an asset by id ALONE (NO owner gate — D20: the vector
   *  substrate carries no `ownerId`; the indexer is a trusted SYSTEM re-reader, never a user-facing surface).
   *  `null` when the asset row is gone; a present-row-missing-blob is an integrity fault (`cas.read` throws).
   *  NOT routed through `getMetadata`'s owner gate; wired only into the embeddings indexer at the root. */
  readonly loadAssetBytes: (assetId: AssetId) => Promise<Uint8Array | null>;
  /** Resolve an asset's `(ownerId, hash, mime)` from its ROW ID alone — un-principal (D20), the
   *  `loadAssetBytes` posture. A pure row lookup (no bytes, no gate); the chat `resolveImageRefToUrl` seam
   *  uses `ownerId` for a chat-scoped reference-check + `mime` for the data-URI. `undefined` when gone. */
  readonly assetCasRefById: (assetId: AssetId) => Promise<AssetCasRef | undefined>;
  /** Every IMAGE asset id (`mime LIKE 'image/%'`) — `ownerId` scopes to ONE owner (the embeddings SINGULAR
   *  sweep: embed MY assets), omitted/null = ALL owners (the BULK dev sweep, PD-53). UN-PRINCIPAL like
   *  `loadAssetBytes` (D20): a trusted SYSTEM sweep, never a user-facing surface; wired only into the
   *  embeddings service at the composition root. A read — never throws. */
  readonly listImageAssetIds: (ownerId?: UserId | null) => Promise<readonly AssetId[]>;
  /** Gallery v1 (§1.2): the caller's own assets, newest-first, keyset-paged. Owner-scoped off
   *  `principal.userId`; optional `kind` filter. Returns a plain array (the client derives the next cursor
   *  from the last row's `(uploadedAt, assetId)`) — a short page is end-of-list. */
  readonly listOwned: (params: ListOwnedParams) => Promise<AssetListItem[]>;
  /** Gallery v2 (§1.3): curate an owned asset into the gallery (optionally as a character's subject). The
   *  asset AND — when given, and when `assertCharacterOwned` is wired — the subject character must be owned
   *  by the actor (owner-only posture); a foreign/missing asset rejects with `AssetNotFoundError`. Upsert-
   *  guarded on `(assetId, subjectCharacterId)` → a duplicate add returns the existing item, idempotently. */
  readonly addToGallery: (params: GalleryAddParams) => Promise<GalleryItemView>;
  /** Gallery v2 (§1.3): remove a gallery item the caller owns. Owner resolved THROUGH the asset join
   *  (`gallery_items → assets.ownerId`); a non-owner/missing item rejects with `GalleryItemNotFoundError`
   *  (leak-free). */
  readonly removeFromGallery: (params: RemoveFromGalleryParams) => Promise<void>;
  /** Gallery v2 (§1.3): the caller's gallery, newest-first, keyset-paged by `(createdAt, galleryItemId)`.
   *  Owner-scoped via the asset join (no stamped owner column); optional `subjectCharacterId` filter. */
  readonly listGallery: (params: GalleryListParams) => Promise<GalleryItemView[]>;
  /** (#67) Resolve the `(assetId, hash)` pairs the OWNER owns among `assetIds` — the inline-image render
   *  resolver (a message body carries `asset:<id>` refs; the blob route is keyed by HASH, so the client
   *  resolves id → hash to build `blobUrl`) AND the send-verb attach trust boundary (the owned subset is the
   *  ownership proof). Owner-scoped by explicit `ownerId` (the router derives it from the session, chat passes
   *  the acting principal's id) — a foreign / gone id is simply absent (no existence leak, no hash oracle). */
  readonly resolveOwnedAssetRefs: (
    ownerId: UserId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;
  /** (#67 co-participant render) Resolve the `(assetId, hash)` pairs among `assetIds` a caller may RENDER in
   *  `chatId` — the CHAT-SCOPED sibling of {@link resolveOwnedAssetRefs} (which is owner-only). Gate
   *  (delegated to the injected {@link AssetsContext.loadChatAssetRefs} op): STRUCTURAL `message_assets`
   *  reference in `chatId` + owner PRESENT + caller PRESENT — never bare chat-membership. Empty when the op
   *  is unwired, the input is empty, or nothing passes the gate (no leak, no hash oracle). */
  readonly resolveChatAssetRefs: (
    callerId: UserId,
    chatId: ChatId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;

  // ── Maintenance / DR (PD-26 + PD-84) — CLI/workload-driven, NOT user-facing (no principal gate). ──

  /** (PD-26) Re-link staged card PNGs to the flat `characters.avatarAssetId` (D28): store each card's bytes
   *  through the coherence writer, then batch-UPDATE the avatar pointer — but ONLY where the stored blob's
   *  hash matches the card's recorded `importHash` (a mismatch is a wrong/corrupt staging file, counted not
   *  linked). Bounded-concurrency store; `dryRun` validates without writing. */
  readonly backfillAvatars: (params: BackfillParams) => Promise<BackfillResult>;
  /** (PD-26) Mark-sweep GC over the WHOLE per-user CAS against the live reference set (the asset-ref
   *  registry): a blob whose asset id is referenced by NO registry column, AND older than the grace window
   *  (mtime — guards the put→link gap), is reclaimed drop-row-BEFORE-blob. Distinct from `reapIfOrphan` (this
   *  sweeps everything, with grace). Script/workload-driven; `dryRun` reports without deleting. */
  readonly collectGarbage: (options: GcOptions) => Promise<GcResult>;
  /** (PD-26) Targeted reap of a KNOWN id set with NO grace — correct ONLY because the caller
   *  (`character.remove` / bulk-remove) just deleted these assets' references and proved they're gone. For
   *  each id still referenced by NO registry column: delete row, then blob, then variants. */
  readonly reapIfOrphan: (assetIds: readonly AssetId[]) => Promise<ReapResult>;
  /** (PD-26) Read-only integrity report: dangling rows (row, no blob — the ordering makes this
   *  never-supposed-to-happen), corrupt blobs (`cas.verify` re-hash mismatch), orphan blobs (blob, no row).
   *  Mutates nothing. */
  readonly fsck: (options?: FsckOptions) => Promise<FsckResult>;
  /** (PD-84) Disaster recovery: re-derive index rows for orphan blobs by walking + hashing the per-user tree,
   *  `sniffMime` supplying a best-effort mime, the given `kind` stamped on every rebuilt row. Goes through the
   *  coherence writer; does NOT emit `asset.created` (the embeddings `content_hash` catch-up sweep re-covers
   *  the vectors — FLAG[PD-84]). Returns rows created vs blobs that already had a row. */
  readonly rebuildFromTree: (options: RebuildOptions) => Promise<RebuildResult>;
}
