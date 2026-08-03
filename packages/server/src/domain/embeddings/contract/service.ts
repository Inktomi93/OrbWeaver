// The typed API surface: the two DI bundles, the verb interface, injected cross-feature op types, and the
// indexer interface. Every cross-feature capability arrives as an injected op (no sideways imports); there is
// no principal/guard on any bundle — the vector substrate carries no ownerId.

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatSegmentId,
  DocumentChunkId,
  DocumentId,
  ImageEmbeddingId,
  UserId,
} from "@orb/kit/ids";
import type { ClearTableParams, CountDocumentChunksParams, EmbedPassParams, PruneDocumentChunksParams, StoreParams, WriteHubScoresParams } from "./params.ts";
import type {
  BulkEmbedResult,
  PruneDocumentChunksResult,
  PurgeDocumentVectorsResult,
  PurgeMemoryVectorsResult,
  StoreResult,
  WriteHubScoresResult,
} from "./results.ts";

/** Re-read a character card's embeddable text by id. `undefined` when deleted between emit and handler. */
export type LoadCardText = (characterId: CharacterId) => Promise<string | undefined>;

/** Re-read an avatar asset's (resized) bytes by id. `undefined` when deleted between emit and handler. */
export type LoadAssetBytes = (assetId: AssetId) => Promise<Uint8Array | undefined>;

/** Re-read an asset's STORED mime by id (the magic-verified upload mime). `null` when the row is gone.
 *  The `onAssetCreated` embeddability gate reads this FIRST — a non-image asset (a `video/*` background,
 *  a document) never reaches the image-embed path and never loads its bytes (see the handler). */
type LoadAssetMime = (assetId: AssetId) => Promise<string | null>;

/** Enumerate non-synthetic character ids; `ownerId` scopes to one owner, omitted/null = all owners. */
export type ListCharacterIds = (ownerId?: UserId | null) => Promise<readonly CharacterId[]>;

/** Enumerate image asset ids; `ownerId` scopes to one owner, omitted/null = all owners. */
export type ListImageAssetIds = (ownerId?: UserId | null) => Promise<readonly AssetId[]>;

/** The DI bundle the embeddings verbs close over (assembled at `entry/`, surfaced via `context.ts`). */
export interface EmbeddingsContext {
  readonly db: Db;
  readonly roleClients: RoleClients;
  readonly now: () => number;
  readonly newCharacterEmbeddingId: () => CharacterEmbeddingId;
  readonly newImageEmbeddingId: () => ImageEmbeddingId;
  readonly newChatDigestId: () => ChatDigestId;
  readonly newChatSegmentId: () => ChatSegmentId;
  readonly newDocumentChunkId: () => DocumentChunkId;
  readonly listCharacterIds: ListCharacterIds;
  readonly loadCardText: LoadCardText;
  readonly listImageAssetIds: ListImageAssetIds;
  readonly loadAssetBytes: LoadAssetBytes;
  readonly embedDim: number;
  readonly imageEmbedDim: number;
}

export interface EmbeddingsService {
  /** The only vector inserter. Hash-gates on `(key, model)` — a matched `content_hash` is a noop; else embeds,
   *  asserts the vector matches the declared space `dim`, and upserts. Never touches `hub_score`. */
  readonly store: (params: StoreParams) => Promise<StoreResult>;
  /** The only path that writes `hub_score` — the discovery → embeddings seam. Takes pre-computed scores. */
  readonly writeHubScores: (params: WriteHubScoresParams) => Promise<WriteHubScoresResult>;
  /** Maintenance: wipe a primary vector table (plain `DELETE FROM`). */
  readonly clearTable: (params: ClearTableParams) => Promise<void>;
  /** Bulk text catch-up sweep: enumerate every non-synthetic character → re-read card text → `store`.
   *  Resumable (hash gate skips already-embedded), cooperative abort, failures propagate. */
  readonly embedCorpus: (params: EmbedPassParams) => Promise<BulkEmbedResult>;
  /** Bulk image catch-up sweep: enumerate every image asset → re-read bytes → `store` both lenses. Caption
   *  generation only runs when a lens row is stale/missing (or `force`). Same resume/abort contract. */
  readonly embedAssets: (params: EmbedPassParams) => Promise<BulkEmbedResult>;
  /** PD-139(b): reclaim the OLD chat-memory embed space — deletes `chat_segments`/`chat_digests` rows whose
   *  `model` differs from the active `roleClients.embedModel`. BULK-ONLY + skip-on-abort is the caller's
   *  guard (the memory-backfill runner), mirroring the embedCorpus/embedAssets purge. */
  readonly purgeMemoryVectors: () => Promise<PurgeMemoryVectorsResult>;
  /** databank-design/05 §2.4 — the reindex-shrink seam. After the ingest upserts a document's current chunks,
   *  this deletes the strays (shrunk tail `chunkIdx >= keepCount` + retired-space `model != model`), scoped to
   *  the one document. databank never touches `document_chunks` directly (single-write-path invariant). */
  readonly pruneDocumentChunks: (params: PruneDocumentChunksParams) => Promise<PruneDocumentChunksResult>;
  /** The DocumentView chunk-count read (per document, active model) — embeddings owns `document_chunks`, so
   *  databank derives its counts through this injected op rather than importing the vector table. */
  readonly countDocumentChunks: (params: CountDocumentChunksParams) => Promise<ReadonlyMap<DocumentId, number>>;
  /** PD-139(c): reclaim the OLD document embed space — deletes `document_chunks` rows whose `model` differs
   *  from the active `roleClients.embedModel`. BULK-ONLY + skip-on-abort is the caller's guard (the
   *  databank-reindex runner), mirroring `purgeMemoryVectors`. */
  readonly purgeDocumentVectors: () => Promise<PurgeDocumentVectorsResult>;
}

/** The DI bundle the indexer handlers close over (assembled at `entry/`). */
export interface EmbeddingsIndexerContext {
  readonly store: EmbeddingsService["store"];
  readonly loadCardText: LoadCardText;
  readonly loadAssetMime: LoadAssetMime;
  readonly loadAssetBytes: LoadAssetBytes;
  readonly roleClients: RoleClients;
  readonly embedDim: number;
  readonly imageEmbedDim: number;
}

/** The event subscription shape `entry/` binds onto the bus: `character.updated` re-embeds the card,
 *  `asset.created` embeds both image lenses. Each handler re-reads canon by id and dispatches to `store`. */
export interface EmbeddingsIndexer {
  readonly onCharacterUpdated: (event: CharacterUpdatedEvent) => Promise<void>;
  readonly onAssetCreated: (event: AssetCreatedEvent) => Promise<void>;
}

/** What the domain's `WorkloadContribution` factory needs from the composition root (the `index` kind) —
 *  this domain's own verbs, nothing cross-feature. */
export interface EmbeddingsWorkloadDeps {
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets">;
}
