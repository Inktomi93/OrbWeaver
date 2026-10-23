// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { CharacterId, ChatId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import type { EmbeddingTask } from "./accounting.ts";

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
