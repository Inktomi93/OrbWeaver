// The typed API surface: the two DI bundles, the verb interface, injected cross-feature op types, and the
// indexer interface. Every cross-feature capability arrives as an injected op (no sideways imports); there is
// no principal/guard on any bundle — the vector substrate carries no ownerId.

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import type { Capability, ProviderId } from "@orb/contracts/inference";
import type { EmbedResult, ImageEmbedResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RoleClients } from "@orb/contracts/role-clients";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
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
  UserConnectionId,
  UserId,
} from "@orb/kit/ids";
import type { GenerationReceipt, GenerationTask } from "./generation.ts";
import type {
  ClearTableParams,
  CountDocumentChunksParams,
  EmbedPassParams,
  OwnerChunkCountsParams,
  PruneDocumentChunksParams,
  PruneMemoryBlocksParams,
  SegmentStoreParams,
  StoreParams,
  WriteHubScoresParams,
} from "./params.ts";
import type {
  BulkEmbedResult,
  PruneDocumentChunksResult,
  PruneMemoryBlocksResult,
  PurgeDocumentVectorsResult,
  PurgeMemoryVectorsResult,
  StoreResult,
  WriteHubScoresResult,
} from "./results.ts";

/** The per-owner bundle resolver the composition root binds over `runtime.roleClientsFor`. */
export type RoleClientsFor = (ownerId: UserId) => Promise<RoleClients>;

/** One resolved encoder snapshot. It deliberately omits credentials while retaining every non-secret field
 * that can change geometry; the call closures execute through this exact snapshot. */
export interface EmbeddingConnectionSnapshot {
  readonly connectionId: UserConnectionId;
  readonly providerId: ProviderId;
  readonly model: string;
  readonly capability: Capability;
  readonly api: string;
  readonly wire: string;
  readonly baseUrl: string | null;
  readonly features: unknown;
  readonly extras: unknown;
  readonly transport: unknown;
  readonly embed: (input: string | readonly string[], opts?: { inputType?: "query" | "document"; instruction?: string }) => Promise<EmbedResult>;
  readonly imageEmbed: (input: ImageEmbedInput) => Promise<ImageEmbedResult>;
}

export interface PinnedGeneration extends GenerationReceipt {
  readonly connection: EmbeddingConnectionSnapshot;
}

export type ResolveEmbeddingConnection = (
  ownerId: UserId,
  task: "embed" | "imageEmbed",
  connectionId?: UserConnectionId | undefined,
) => Promise<EmbeddingConnectionSnapshot | null>;

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
  /** The per-FUNDER role-client bundle (inference program §7.5-2): a vector task is `scope: "owner"`, so the
   *  entity's OWNER funds the embed and DEFINES the space (their `embed`/`imageEmbed` binding). */
  readonly roleClientsFor: RoleClientsFor;
  readonly resolveEmbeddingConnection: ResolveEmbeddingConnection;
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
  /** The entity OWNER by id (the sweeps' funder read; the indexer context carries the same pair). */
  readonly loadCharacterOwner: (characterId: CharacterId) => Promise<UserId | null>;
  readonly loadAssetOwner: (assetId: AssetId) => Promise<UserId | null>;
  readonly embedDim: number;
  readonly imageEmbedDim: number;
}

export interface EmbeddingsService {
  readonly resolveGeneration: (ownerId: UserId, task: GenerationTask, via?: GenerationTask) => Promise<PinnedGeneration | null>;
  /** The only vector inserter for the single-item lenses. Hash-gates on `(key, model)` — a matched
   *  `content_hash` is a noop; else embeds, asserts the vector matches the declared space `dim`, and upserts.
   *  Never touches `hub_score`. Verbatim SEGMENTS go through {@link storeSegments} instead. */
  readonly store: (params: StoreParams) => Promise<StoreResult>;
  /**
   * The verbatim-segment write path — a BATCH, because segments are the one lens whose producer has the whole
   * corpus's work in hand at once (#172, the owner batching ruling: "batch by phase, toss it all at vLLM, its
   * scheduler can handle it"). It hash-gates every chunk on `(chatId, blockIdx, chunkIdx, model)`, embeds ALL
   * the survivors in ONE call — no client-side throttle or round-robin; the provider surface owns how that
   * lands on the wire — and then upserts each row. Results are index-aligned to the input.
   *
   * A one-element call is the live post-turn path; the corpus sweep passes every chat's pending chunks at
   * once, which is what turns the segment phase from N serialized embeds into one saturated flood.
   */
  readonly storeSegments: (params: readonly SegmentStoreParams[]) => Promise<readonly StoreResult[]>;
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
  /** Reclaim the OLD chat-memory embed space — deletes `chat_segments`/`chat_digests` rows whose
   *  `model` differs from the active `roleClients.embedModel`. BULK-ONLY + skip-on-abort is the caller's
   *  guard (the memory-backfill runner), mirroring the embedCorpus/embedAssets purge. */
  readonly purgeMemoryVectors: (params: { readonly ownerId: UserId; readonly generation: GenerationReceipt }) => Promise<PurgeMemoryVectorsResult>;
  /** The chat-memory SHRINK seam: delete the digest/segment rows whose BLOCK no longer exists in canon (and,
   *  for digests, the consolidations that folded them). Distinct from {@link purgeMemoryVectors}, which
   *  reclaims a retired embed SPACE — this one reclaims blocks that canon itself dropped. memory calls it at
   *  the end of every build pass; an ordinary pass deletes nothing. */
  readonly pruneMemoryBlocks: (params: PruneMemoryBlocksParams) => Promise<PruneMemoryBlocksResult>;
  /** the reindex-shrink seam. After the ingest upserts a document's current chunks,
   *  this deletes the strays (shrunk tail `chunkIdx >= keepCount` + retired-space `model != model`), scoped to
   *  the one document. databank never touches `document_chunks` directly (single-write-path invariant). */
  readonly pruneDocumentChunks: (params: PruneDocumentChunksParams) => Promise<PruneDocumentChunksResult>;
  /** The DocumentView chunk-count read (per document, active model) — embeddings owns `document_chunks`, so
   *  databank derives its counts through this injected op rather than importing the vector table. */
  readonly countDocumentChunks: (params: CountDocumentChunksParams) => Promise<ReadonlyMap<DocumentId, number>>;
  /** Every chunk count in an OWNER's bank — the databank library's PHASE-lens fact (its key set) and the
   *  bank-health census's passage sums. Owner-scoped, where {@link countDocumentChunks} is id-scoped (a page
   *  whose rows are already chosen). Same reason both exist at all: databank never imports the vector table. */
  readonly countDocumentChunksByOwner: (params: OwnerChunkCountsParams) => Promise<ReadonlyMap<DocumentId, number>>;
  /** Reclaim the OLD document embed space — deletes `document_chunks` rows whose `model` differs
   *  from the active `roleClients.embedModel`. BULK-ONLY + skip-on-abort is the caller's guard (the
   *  databank-reindex runner), mirroring `purgeMemoryVectors`. */
  readonly purgeDocumentVectors: (params: { readonly ownerId: UserId; readonly generation: GenerationReceipt }) => Promise<PurgeDocumentVectorsResult>;
}

/** The DI bundle the indexer handlers close over (assembled at `entry/`). */
export interface EmbeddingsIndexerContext {
  readonly store: EmbeddingsService["store"];
  /** The indexer's OWN skip-log table (`image_index_skips`) — read/written directly (not through an injected
   *  op) because it is this domain's own table, exactly as the bulk `embedAssets` sweep touches it via
   *  `ctx.db`. The cross-domain canon re-reads stay injected (loadCardText/loadAssetBytes/loadAssetMime). */
  readonly db: Db;
  /** The injected clock — the admission-floor skip-record's `created_at`. */
  readonly now: () => number;
  readonly loadCardText: LoadCardText;
  readonly loadAssetMime: LoadAssetMime;
  readonly loadAssetBytes: LoadAssetBytes;
  /** The entity OWNER by id — the funder of the row's embed (the events carry no owner). Trusted re-readers,
   *  like `loadCardText`. */
  readonly loadCharacterOwner: (characterId: CharacterId) => Promise<UserId | null>;
  readonly loadAssetOwner: (assetId: AssetId) => Promise<UserId | null>;
  readonly roleClientsFor: RoleClientsFor;
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
 *  this domain's own verbs, plus the freshness plane the sweep's terminal fans on. */
export interface EmbeddingsWorkloadDeps {
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets">;
  /**
   * The per-user freshness plane (`corpusRecomputed`) — injected, never a sideways reach at the bus (D38).
   * The `index` sweep rewrites the vectors every `discovery.*` read and `search.similarArt` are derived from,
   * and it is a WORKLOAD: no mutation exists for any client to hang an `invalidates` on (survey §2.5). Fanned
   * at the pass TERMINAL, once per owner in scope — never per embedded row (that is a corpus-sized storm).
   *
   * The MEMBER is `corpusRecomputed`, shared with discovery's five analytics passes rather than an
   * `embeddingsChanged` of its own: no client read projects a raw vector, so what a subscriber is being told
   * is "the analytics over your corpus moved", which is one fact with one member (survey F6).
   *
   * FLAG[emit-is-total] — by construction: synchronous, `void`-returning, non-throwing (transport's
   * `publishUserEvent`, live-only, no durable row, no FK).
   */
  readonly emitUserEvent: EmitUserEvent;
  /** The bulk arm's announce audience — every owner with corpus rows. Only consulted when the run context's
   *  `ownerId` is `null`; wired at compose to discovery's `distinctCorpusOwners` (whose header states the
   *  deliberate over-inclusiveness), which is why it arrives as an op rather than a local query. */
  readonly listCorpusOwners: () => Promise<UserId[]>;
}
