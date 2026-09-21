// The dispatch axes (SourceKind, SourceLens) + the verb input shapes for the embeddings write surface.

import type { ImageCaptionMeta, ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { AssetId, CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";

/** The producer classes whose content the store verb embeds. `document` (databank-design/05 §1) is the 4th
 *  member — a databank source document's chunks feeding the 5th vector table.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const SOURCE_KINDS = ["card", "avatar", "chat-block", "document"] as const;
/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const TEXT_LENSES = ["card-text", "segment", "digest", "chunk"] as const;
/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const SOURCE_LENSES = [...TEXT_LENSES, ...IMAGE_LENSES] as const;
/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export type SourceLens = (typeof TEXT_LENSES)[number] | ImageLens;

/** The primary vector tables `embeddings` owns — the single registry all callers derive from. `document_chunks`
 *  is the 5th table (databank-design/05 §1; PD-139(c) — the runtime tuple gains it so the model-change purge
 *  and hub-score seams cover it uniformly). */
export const VECTOR_TABLES = ["character_embeddings", "image_embeddings", "chat_digests", "chat_segments", "document_chunks"] as const;
export type VectorTable = (typeof VECTOR_TABLES)[number];

// Store params: a discriminated union on `lens`. `ownerId` is the entity OWNER — the FUNDER whose embed
// connection produces the vector and whose binding defines the space (inference program §7.5-2, a vector task
// is `scope: "owner"`). Vector rows still FK to their producer only; owner-scope at search time derives from
// the producer, never from a column here.

/** Embed a character card's text. Unique key: `(characterId, model)`. */
export interface CardTextStoreParams {
  readonly kind: "card";
  readonly lens: "card-text";
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly content: string;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even when the stored `content_hash` matches. */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image's pure visual signal (no caption influence). Unique key: `(assetId, model, lens)`. */
export interface ImageRawStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-raw";
  readonly ownerId: UserId;
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image jointly with its generated caption (image bytes + caption → one VL vector). The
 *  caption is also persisted on the row. Unique key: `(assetId, model, lens)`. */
export interface ImageCaptionedStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-captioned";
  readonly ownerId: UserId;
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  /** Combined into the embed input AND written to `image_embeddings.caption`. */
  readonly caption: string;
  /** The VL breakdown + its `model` provenance → `image_embeddings.caption_meta`. TYPED, not an open
   *  bag: the facet vocabulary has one home in `@orb/contracts/embeddings` and both sides import it
   *  (issue #164 — the reader named fourteen facets this carrier could not promise). */
  readonly captionMeta: ImageCaptionMeta;
  /** THE JOINT-SPACE ARM (§10-3). `imageEmbed` = the joint image+caption vector through the owner's image
   *  embedder. `embed` = the CAPTIONED-TEXT fallback: the owner has no image-capable embedder, so the
   *  caption alone is embedded as TEXT into their `embed` space. The store verb dispatches the role op off
   *  this — it is not derivable from `model`, which is just a tag, and guessing it wrong writes a vector
   *  into a geometry nothing queries. */
  readonly via: "imageEmbed" | "embed";
  readonly model: string;
  readonly dim: number;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed ONE in-budget chunk of an aged-out chat block's verbatim transcript. `text` is the embed input AND
 *  the stored `chat_segments.text`. `contentHash` is precomputed by memory (not recomputed here). Unique key:
 *  `(chatId, blockIdx, chunkIdx, model)`.
 *
 *  Segments are written through {@link EmbeddingsService.storeSegments} (a BATCH), never through the single
 *  `store` — a block over the embed window becomes N chunks (#172), and the corpus sweep submits every chat's
 *  chunks as ONE embed flood (owner batching ruling: batch by phase, let vLLM's scheduler own concurrency). */
export interface SegmentStoreParams {
  readonly kind: "chat-block";
  readonly lens: "segment";
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  /** Position within the block (0 when one chunk covers it whole — the overwhelming majority). */
  readonly chunkIdx: number;
  /** The HONEST span of messages this chunk's text contains (see `db/schema/embeddings.ts` chat_segments). */
  readonly seqStart: number;
  readonly seqEnd: number;
  /** The verbatim chunk transcript — embedded AND persisted (`chat_segments.text`). */
  readonly text: string;
  /** Staleness/collapse key, precomputed by memory (per CHUNK — it folds the chunk's position + count). */
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
}

/** Embed an aged-out chat block's distilled digest. `text` is the distilled body — the embed input, the
 *  stored `chat_digests.text`, and what fills `{{memory}}`. `scopedCharacterId` is always a real
 *  `CharacterId`, never a `''` sentinel. Unique key: `(chatId, scopedCharacterId, tier, blockIdx)`. */
export interface DigestStoreParams {
  readonly kind: "chat-block";
  readonly lens: "digest";
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  /** True when the block is from a group room (drives the egocentric-vs-shared recall split). */
  readonly isGroup: boolean;
  /** The consolidation tier (0 = a single block; `k>0` = a cross-block synthesis). */
  readonly tier: number;
  readonly blockIdx: number;
  readonly text: string;
  /** The mandatory `[entities — scene]` first line, kept as a retrieval facet. */
  readonly topicAnchor: string;
  readonly keywords: readonly string[];
  /** The characters this digest contains — persisted as the `chat_digest_speakers` join so search/discovery
   *  find a character's moments across rooms regardless of egocentric bucketing. May be empty. */
  readonly speakerCharacterIds: readonly CharacterId[];
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
}

/** Embed a databank document chunk (databank-design/05 §2.1). `content` is the chunk slice (kit/chunk output,
 *  incl. any overlap prefix) — the embed input; the store hashes it for the staleness gate. `(model, dim)` is
 *  the caller-supplied active embed space; the `fkRefs` locate the chunk in its producer document. No
 *  `ownerId` (D20 — owner derives via `documents.ownerId`); no `hubScore` (discovery-only). Unique key:
 *  `(documentId, chunkIdx, model)`. */
export interface DocumentChunkStoreParams {
  readonly kind: "document";
  readonly lens: "chunk";
  readonly ownerId: UserId;
  readonly content: string;
  readonly model: string;
  readonly dim: number;
  readonly fkRefs: {
    readonly documentId: DocumentId;
    readonly chunkIdx: number;
    /** The non-overlap span offsets into `documents.extractedText` (source highlighting + lossless coverage). */
    readonly charStart: number;
    readonly charEnd: number;
  };
}

/** The single write path's input — discriminated on `lens`. `segment` is NOT an arm: verbatim segments are
 *  written in BATCHES through `storeSegments` (#172), the one place their corpus-wide embed flood lives. */
export type StoreParams = CardTextStoreParams | ImageRawStoreParams | ImageCaptionedStoreParams | DigestStoreParams | DocumentChunkStoreParams;

/** `pruneDocumentChunks` input (databank-design/05 §2.4) — the reindex-shrink seam. After the ingest upserts
 *  every current chunk (hash-gated no-ops keep it cheap), this deletes the strays: tail rows
 *  (`chunkIdx >= keepCount`, a shrunk chunk set) AND rows in a retired `(model)` space (`model != model`).
 *  The delete lives HERE — the table owner — because databank never touches `document_chunks` directly
 *  (the single-write-path invariant); it mirrors `writeHubScores` as a narrow, named, non-`store` write. */
export interface PruneDocumentChunksParams {
  readonly documentId: DocumentId;
  /** Delete rows with `chunkIdx >= keepCount` (the shrunk-tail reclaim). */
  readonly keepCount: number;
  /** … and ALL rows whose `model !== model` (retired-space cleanup). */
  readonly model: string;
}

/** `pruneMemoryBlocks` input — the chat-memory SHRINK seam (the {@link PruneDocumentChunksParams} idiom for
 *  the two memory tables). memory's build STORES every current block then calls this to reclaim the blocks
 *  that no longer exist: hiding a trailing span, deleting rows, or any other shrink of the ingest set stops
 *  producing the trailing block, and the content-hash self-heal cannot reach a block that VANISHED — it only
 *  re-summarizes blocks that still exist. Without the prune, the digest summarized FROM the removed rows
 *  stayed in the recall pool.
 *
 *  Two arms mirroring the `store` op's own digest/segment split (same lens vocabulary, same reason: digests
 *  are scope-keyed and tiered, segments are chat-wide and flat). The delete lives in embeddings — the table
 *  owner — because chat never touches the vector tables directly (the single-write-path invariant, D20). */
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

/** THE STALENESS-INVALIDATION arm (#1395) — a third `lens` value on the prune seam rather than a third verb,
 *  because it is the same question asked about a different reason for a row to be wrong: the shrink arm above
 *  reclaims blocks that stopped EXISTING, this one reclaims blocks whose stored digest the build has already
 *  PROVEN stale (hash mismatch) and then failed to replace (an empty/failed summarize). Without it the
 *  known-stale row keeps serving recall until some later pass happens to succeed — see
 *  `persistence/clear.ts::dropChatDigestKeys`. `keys` is exactly the set the caller attempted and abandoned. */
interface PruneStaleDigestsParams {
  readonly lens: "digest-stale";
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  /** Each key carries the content hash it PROVED stale — the delete is a compare-and-swap against it, so a
   *  sibling pass that healed the block in the meantime keeps its fresh row (`persistence/clear.ts`). */
  readonly keys: readonly { readonly tier: number; readonly blockIdx: number; readonly staleHash: string }[];
}

export type PruneMemoryBlocksParams = PruneDigestBlocksParams | PruneSegmentBlocksParams | PruneStaleDigestsParams;

/** The databank chunk-count read (the DocumentView `chunkCount`/`embeddedCount` derivation). embeddings owns
 *  `document_chunks`, so databank reaches this count through the injected op — never a direct table import. */
export interface CountDocumentChunksParams {
  readonly documentIds: readonly DocumentId[];
  readonly model: string;
}

/** The databank BANK-WIDE chunk read (`countDocumentChunksByOwner`) — the twin above, scoped by OWNER instead
 *  of by id list. Owner-scoped precisely because its callers do not know their id set yet: the library's
 *  phase lens is resolving a predicate over the whole bank BEFORE it pages, and the health census is summing
 *  the whole bank by definition. */
export interface OwnerChunkCountsParams {
  readonly ownerId: UserId;
  readonly model: string;
}

/** `embedCorpus` / `embedAssets` input — the resumable, `content_hash`-gated bulk sweep. `force` re-embeds
 *  matched rows; `signal` is the cooperative abort, checked between items. */
export interface EmbedPassParams {
  readonly force: boolean;
  readonly signal: AbortSignal;
  /** Scope to one owner; `null` = every owner. Rows themselves stay owner-less — this only narrows which
   *  producers the pass reads. */
  readonly ownerId: UserId | null;
  /** Per-item position, for the caller's progress surface: called after each item with how many of the
   *  enumerated total are done. Absent = a silent pass (every non-workload caller). The pass is the ONLY
   *  place that knows its denominator — the workload wrapper enumerates nothing (issue #166 rider 3). */
  readonly onProgress?: ((done: number, total: number) => void) | undefined;
}

export interface HubScoreUpdate {
  readonly id: string;
  readonly model: string;
  readonly hubScore: number;
}

/** `writeHubScores` input — the only non-`store` UPDATE surface (the chunk-reclaim DELETEs are the
 *  other non-`store` writes), and the only path that touches `hub_score`. `discovery` computes, this stores. */
export interface WriteHubScoresParams {
  readonly table: VectorTable;
  readonly updates: readonly HubScoreUpdate[];
}

export interface ClearTableParams {
  readonly table: VectorTable;
}
