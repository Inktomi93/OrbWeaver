// domain/assets/contract/service — the typed API surface: AssetsContext (the DI bundle) + AssetsService
// (upload/fetch/variant core, gallery, and maintenance/DR verbs). Every surface is owner-scoped off
// `principal.userId`; maintenance verbs are un-principal (CLI/workload/DR callers only).

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

/** The DI bundle every assets verb closes over (wired at `service.ts`); explicit interface, not `ReturnType<>`. */
export interface AssetsContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants?: VariantCache;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  readonly emit: EmitDomainEvent;
  readonly now: () => number;
  readonly newAssetId: () => AssetId;
  readonly newGalleryItemId: () => GalleryItemId;
  /** Roster-avatar reference-check (NOT a hash→any-owner oracle): returns the asset's owner only if the
   *  hash is an avatar/attachment the caller may render in a shared chat; `undefined` otherwise. Optional. */
  readonly loadCoParticipantOwner?: (callerId: UserId, hash: string) => Promise<UserId | undefined>;
  /** Chat-scoped render resolver: `(assetId, hash)` pairs among `assetIds` the caller may render in `chatId`
   *  (structural `message_assets` reference + owner present + caller present). Optional. */
  readonly loadChatAssetRefs?: (
    callerId: UserId,
    chatId: ChatId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;
  /** Gallery owner-only posture: does `ownerId` own `characterId`? Optional — absent skips the subject check. */
  readonly assertCharacterOwned?: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
  /** Gallery export re-link: the portable `handle` of a character by id, or null if gone. Optional. */
  readonly resolveCharacterHandle?: (characterId: CharacterId) => Promise<string | null>;
  /** Gallery import re-link: the owner's own character id carrying `handle`, or null if none exists. Optional. */
  readonly findCharacterByHandle?: (args: {
    readonly ownerId: UserId;
    readonly handle: string;
  }) => Promise<CharacterId | null>;
}

export interface AssetsService {
  /** Persist bytes to the owner's CAS + upsert the index row. `created:false` on within-user dedup;
   *  emits `asset.created` only on a genuinely new asset. */
  readonly store: (params: StoreParams) => Promise<StoredAsset>;
  /** The blob-serve gate: `{mime,size}` of an asset the caller owns, or `undefined` (404) otherwise. */
  readonly getMetadata: (params: GetMetadataParams) => Promise<AssetMetadata | undefined>;
  /** Resolve a resized-webp variant of an owned blob: snap width to the ladder → cache-read → transform+cache. */
  readonly resolveVariant: (params: ResolveVariantParams) => Promise<Uint8Array | undefined>;
  /** The image-embed canon re-reader: CAS bytes of an asset by id alone, no owner gate (system re-reader). */
  readonly loadAssetBytes: (assetId: AssetId) => Promise<Uint8Array | null>;
  /** Resolve an asset's `(ownerId, hash, mime)` from its row id alone — un-principal, pure row lookup. */
  readonly assetCasRefById: (assetId: AssetId) => Promise<AssetCasRef | undefined>;
  /** Every image asset id; `ownerId` scopes to one owner, omitted/null = all owners. Un-principal sweep. */
  readonly listImageAssetIds: (ownerId?: UserId | null) => Promise<readonly AssetId[]>;
  /** Gallery v1: the caller's own assets, newest-first, keyset-paged; optional `kind` filter. */
  readonly listOwned: (params: ListOwnedParams) => Promise<AssetListItem[]>;
  /** Gallery v2: curate an owned asset into the gallery (optionally as a character's subject). Idempotent
   *  on `(assetId, subjectCharacterId)`. */
  readonly addToGallery: (params: GalleryAddParams) => Promise<GalleryItemView>;
  /** Gallery v2: remove a gallery item the caller owns (owner resolved through the asset join). */
  readonly removeFromGallery: (params: RemoveFromGalleryParams) => Promise<void>;
  /** Gallery v2: the caller's gallery, newest-first, keyset-paged; optional `subjectCharacterId` filter. */
  readonly listGallery: (params: GalleryListParams) => Promise<GalleryItemView[]>;
  /** Resolve `(assetId, hash)` pairs the owner owns among `assetIds` — inline-image render + attach boundary. */
  readonly resolveOwnedAssetRefs: (
    ownerId: UserId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;
  /** Chat-scoped sibling of {@link resolveOwnedAssetRefs}: pairs a caller may render in `chatId`, gated via
   *  {@link AssetsContext.loadChatAssetRefs}. */
  readonly resolveChatAssetRefs: (
    callerId: UserId,
    chatId: ChatId,
    assetIds: readonly AssetId[],
  ) => Promise<readonly AssetBlobRef[]>;

  // ── Maintenance / DR — CLI/workload-driven, not user-facing. ──

  /** Re-link staged card PNGs to `characters.avatarAssetId` where the stored blob's hash matches `importHash`. */
  readonly backfillAvatars: (params: BackfillParams) => Promise<BackfillResult>;
  /** Mark-sweep GC over the whole per-user CAS against the live reference set, with a grace window on mtime. */
  readonly collectGarbage: (options: GcOptions) => Promise<GcResult>;
  /** Targeted reap of a known id set with no grace — caller must have already deleted these assets' references. */
  readonly reapIfOrphan: (assetIds: readonly AssetId[]) => Promise<ReapResult>;
  /** Read-only integrity report: dangling rows, corrupt blobs, orphan blobs. Mutates nothing. */
  readonly fsck: (options?: FsckOptions) => Promise<FsckResult>;
  /** Disaster recovery: re-derive index rows for orphan blobs by walking + hashing the per-user tree. */
  readonly rebuildFromTree: (options: RebuildOptions) => Promise<RebuildResult>;
}
