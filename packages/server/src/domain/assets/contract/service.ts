// domain/assets/contract/service — the typed API surface: AssetsContext (the DI bundle) + AssetsService
// (upload/fetch/variant core, gallery, and maintenance/DR verbs). Every surface is owner-scoped off
// `principal.userId`; maintenance verbs are un-principal (CLI/workload/DR callers only).

import type { EmitDomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, ChatId, GalleryItemId, UserId } from "@orb/kit/ids";
import type { ImageInfo, ImageTransformOptions } from "#infra/image";
import type { Cas, VariantCache } from "#infra/storage";
import type { BackfillParams, BackfillResult, FsckOptions, FsckResult, GcOptions, GcResult, ReapResult, RebuildOptions, RebuildResult } from "./maintenance.ts";
import type {
  GalleryAddParams,
  GalleryListParams,
  GetMetadataParams,
  ListOwnedParams,
  RemoveFromGalleryParams,
  ResolveVariantParams,
  StoreParams,
} from "./params.ts";
import type { AssetCasRef, AssetMetadata, OwnedAssetBytes, StoredAsset } from "./results.ts";
import type { AssetBlobRef, AssetListItem, GalleryItemView } from "./views.ts";

/** The DI bundle every assets verb closes over (wired at `service.ts`); explicit interface, not `ReturnType<>`. */
export interface AssetsContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants?: VariantCache;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** Live getter for the admin-tunable lossy-encoder quality (item 6 — AppSettings.imageVariantQuality). Read
   *  per resolve so a retune applies without a restart; FOLDED INTO the variant cache key so a quality change
   *  yields a fresh encode. Optional (tests / cache-less contexts) ⇒ the resolver's fallback. */
  readonly imageVariantQuality?: () => number;
  readonly emit: EmitDomainEvent;
  readonly now: () => number;
  readonly newAssetId: () => AssetId;
  readonly newGalleryItemId: () => GalleryItemId;

  /** Decode an image to its dims/format (the sealed sharp adapter's `probe`) — the BYO pose import computes a
   *  skeleton's orientation from its dimensions (C6c). Rejects non-image bytes (sharp throws). */
  readonly imageProbe: (bytes: Uint8Array) => Promise<ImageInfo>;
  /** Roster-avatar reference-check (NOT a hash→any-owner oracle): returns the asset's owner only if the
   *  hash is an avatar/attachment the caller may render in a shared chat; `undefined` otherwise. Optional. */
  readonly loadCoParticipantOwner?: (callerId: UserId, hash: string) => Promise<UserId | undefined>;
  /** Chat-scoped render resolver: `(assetId, hash)` pairs among `assetIds` the caller may render in `chatId`
   *  (structural `message_assets` reference + owner present + caller present). Optional. */
  readonly loadChatAssetRefs?: (callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]) => Promise<readonly AssetBlobRef[]>;
  /** Gallery owner-only posture: does `ownerId` own `characterId`? Optional — absent skips the subject check. */
  readonly assertCharacterOwned?: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
  /** Gallery export re-link: the portable `handle` of a character by id, or null if gone. Optional. */
  readonly resolveCharacterHandle?: (characterId: CharacterId) => Promise<string | null>;
  /** Gallery import re-link: the owner's own character id carrying `handle`, or null if none exists. Optional. */
  readonly findCharacterByHandle?: (args: { readonly ownerId: UserId; readonly handle: CharacterHandle }) => Promise<CharacterId | null>;
  /** The character-owned avatar-pointer WRITE `backfillAvatars` delegates to (`characters.avatarAssetId` is
   *  CHARACTER's column — a cross-domain write routes through the owning domain, Constitution.md §2 / Tier-1-DB.md
   *  §"Cross-tier composition"). REQUIRED, not optional: an absent op would silently turn the relink into a
   *  no-op that still reports `linked: n`. Locally declared (structural), never a sideways type import. */
  readonly linkCharacterAvatars: LinkCharacterAvatarsOp;
}

/** Character-owned avatar-relink write op; assets maps its verified `(characterId, assetId)` pairs and never
 *  touches the `characters` table itself. Owner-scoped per row; a no-op on an empty list. */
type LinkCharacterAvatarsOp = (args: {
  readonly ownerId: UserId;
  readonly links: readonly { readonly characterId: CharacterId; readonly assetId: AssetId }[];
}) => Promise<void>;

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
  /** Owner-gated byte read (EC-B): the CALLER'S OWN asset bytes + mime by id — imagery caption/edit source,
   *  expressions sheet re-read, rpg, databank. Throws AssetNotFoundError when missing OR not the caller's
   *  (collapsed, leak-free). NOT `loadAssetBytes` — that is the un-principal indexer read (D20). */
  readonly readOwnedAssetBytes: (caller: Principal, assetId: AssetId) => Promise<OwnedAssetBytes>;
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
  readonly resolveOwnedAssetRefs: (ownerId: UserId, assetIds: readonly AssetId[]) => Promise<readonly AssetBlobRef[]>;

  /** Chat-scoped sibling of {@link resolveOwnedAssetRefs}: pairs a caller may render in `chatId`, gated via
   *  {@link AssetsContext.loadChatAssetRefs}. */
  readonly resolveChatAssetRefs: (callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]) => Promise<readonly AssetBlobRef[]>;

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

/** What the domain's `WorkloadContribution` factory needs from the composition root (the three CAS
 *  maintenance kinds). `db` + `cas` are here because the `assets-backfill` GATHER (the staged-card scan +
 *  per-row CAS probe) belongs in this domain — it used to run at the entry tier. */
export interface AssetsWorkloadDeps {
  readonly db: Db;
  readonly cas: Cas;
  readonly assets: Pick<AssetsService, "backfillAvatars" | "collectGarbage" | "fsck">;
}
