// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { AssetId, CharacterId, ChatId, DocumentId, EmbedGenerationId, UserConnectionId, UserId } from "@orb/kit/ids";
import type { EmbedTargetRefusal } from "../inference/connection.ts";
import type { EmbeddingTask } from "./accounting.ts";
import type { CountDocumentChunksParams, OwnerChunkCountsParams, PruneDocumentChunksParams } from "./document-vectors.ts";

/** The owner and concrete vector-space receipt shared by chat memory and embedding reindex.
 *  Both consume this immutable identity; neither imports the other domain's context. */

export interface MemoryEmbedSpace {
  readonly ownerId: UserId;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
  readonly generationEpoch: number;
}

export interface GenerationReceipt {
  readonly id: EmbedGenerationId;
  readonly task: EmbeddingTask;
  readonly via: EmbeddingTask;
  readonly epoch: number;
  readonly space: string;
}
export interface DocumentVectorSweepReceipt {
  readonly ownerId: UserId;
  readonly generation: GenerationReceipt;
}

// `pruneMemoryBlocks` input — the chat-memory SHRINK seam (the document-chunk prune idiom for
//  the two memory tables). memory's build STORES every current block then calls this to reclaim the blocks
//  that no longer exist: hiding a trailing span, deleting rows, or any other shrink of the ingest set stops
//  producing the trailing block, and the content-hash self-heal cannot reach a block that VANISHED — it only
//  re-summarizes blocks that still exist. Without the prune, the digest summarized FROM the removed rows
//  stayed in the recall pool.
//
//  Two arms mirroring the `store` op's own digest/segment split (same lens vocabulary, same reason: digests
//  are scope-keyed and tiered, segments are chat-wide and flat). The delete lives in embeddings — the table
//  owner — because chat never touches the vector tables directly (the single-write-path invariant, D20).
interface PruneDigestBlocksParams {
  readonly lens: "digest";
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  /** The surviving block COUNT per tier (index = tier): every stored row with `blockIdx >= keepPerTier[tier]`
   *  is beyond canon. The caller derives the whole array from ONE number (tier 0's block count) by the same
   *  `floor(children / fanOut)` rule the consolidation writer uses, which is what makes the cascade upward
   *  automatic: a parent that folded a pruned block is itself beyond its tier's ceiling. */
  readonly keepPerTier: readonly number[];
}

interface PruneSegmentBlocksParams {
  readonly lens: "segment";
  readonly chatId: ChatId;
  /** Segments are chat-wide and single-tier — one BLOCK ceiling, no scope bucket. Rows at
   *  `blockIdx >= keepBlockCount` index canon that is no longer ingested. */
  readonly keepBlockCount: number;
  /** The second ceiling, per block, since a block is a ROW SET now (#172): the blocks whose chunk count is
   *  NOT 1, so `chunkIdx >= chunkCount` is deletable. Listing only the exceptions keeps the DELETE bounded —
   *  every block absent from this list holds exactly one chunk, so anything at `chunkIdx >= 1` is stale
   *  there. A block that could not be chunked at all (the pathological ceiling) rides here with
   *  `chunkCount: 0`, which reclaims its whole row set. */
  readonly chunkCounts: readonly { readonly blockIdx: number; readonly chunkCount: number }[];
}

// THE STALENESS-INVALIDATION arm (#1395) — a third `lens` value on the prune seam rather than a third verb,
//  because it is the same question asked about a different reason for a row to be wrong: the shrink arm above
//  reclaims blocks that stopped EXISTING, this one reclaims blocks whose stored digest the build has already
//  PROVEN stale (hash mismatch) and then failed to replace (an empty/failed summarize). Without it the
//  known-stale row keeps serving recall until some later pass happens to succeed — see
//  `persistence/clear.ts::dropChatDigestKeys`. `keys` is exactly the set the caller attempted and abandoned.
interface PruneStaleDigestsParams {
  readonly lens: "digest-stale";
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  /** Each key carries the content hash it PROVED stale — the delete is a compare-and-swap against it, so a
   *  sibling pass that healed the block in the meantime keeps its fresh row (`persistence/clear.ts`). */
  readonly keys: readonly { readonly tier: number; readonly blockIdx: number; readonly staleHash: string }[];
}

export type PruneMemoryBlocksParams = PruneDigestBlocksParams | PruneSegmentBlocksParams | PruneStaleDigestsParams;

/** Enumerate non-synthetic character ids; `ownerId` scopes to one owner, omitted/null = all owners. */
export type ListCharacterIds = (ownerId?: UserId | null) => Promise<readonly CharacterId[]>;

/** Enumerate image asset ids; `ownerId` scopes to one owner, omitted/null = all owners. */
export type ListImageAssetIds = (ownerId?: UserId | null) => Promise<readonly AssetId[]>;

/** A target move refused before it purged anything: the new encoder does not make the width its connection states, did
 *  not answer the probe that would tell, or refused the row's key. The connection domain undoes its write and raises
 *  the typed error that carries {@link EmbedTargetRefusal}, which is this refusal without the task it names. */
export type EmbedMoveRefusal = EmbedTargetRefusal & { readonly task: EmbeddingTask };

/** rows deleted by the reindex-shrink prune (shrunk tail + retired-space rows). */
export interface PruneDocumentChunksResult {
  readonly rowsDeleted: number;
}

/** Would the owner's stored target for `task` move if `via` resolved through `connectionId`? */
export interface TargetWouldMoveArgs {
  readonly ownerId: UserId;
  readonly task: EmbeddingTask;
  readonly via: EmbeddingTask;
  readonly connectionId: UserConnectionId;
}

/** The reindex-shrink seam: deletes a document's stray chunks. */
export type PruneDocumentChunksOp = (params: PruneDocumentChunksParams) => Promise<PruneDocumentChunksResult>;

/** The DocumentView chunk-count read (per document, active model). */
export type CountDocumentChunksOp = (params: CountDocumentChunksParams) => Promise<ReadonlyMap<DocumentId, number>>;

/** Every chunk count in an owner's bank. */
export type CountDocumentChunksByOwnerOp = (params: OwnerChunkCountsParams) => Promise<ReadonlyMap<DocumentId, number>>;

/** Bring the owner's stored targets in line with what their vector bindings resolve to now. */
export type SyncTargetGenerationsOp = (ownerId: UserId) => Promise<EmbedMoveRefusal | null>;

/** Read-only preview of a target move; `null` when that row cannot resolve. */
export type TargetWouldMoveOp = (args: TargetWouldMoveArgs) => Promise<boolean | null>;

/** Resolve the owner's encoder for `task` into a connection snapshot; `null` when an explicit `connectionId` no
 *  longer resolves. `cachedFacts`: read only the server facts already cached, dialing nothing (a read-only
 *  preview). The snapshot's call closures take an AbortSignal, so each domain types its own connection. */
export type ResolveEmbeddingConnectionOp<TConnection> = (
  ownerId: UserId,
  task: EmbeddingTask,
  connectionId?: UserConnectionId | undefined,
  opts?: { readonly cachedFacts?: boolean | undefined },
) => Promise<TConnection | null>;
