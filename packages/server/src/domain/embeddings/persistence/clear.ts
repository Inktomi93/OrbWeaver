// domain/embeddings/persistence/clear — the typed DELETE FROM over a primary vector table.
//
// A plain DELETE FROM is safe here because there is no ANN/DiskANN shadow index over these F32_BLOB
// columns — search is an exact ORDER BY vector_distance_cos(...) scan. If a libSQL ANN index is ever
// added, this comment is the tripwire: a bare DELETE would then desync the shadow index.

import type { Db } from "@orb/db";
import { characterEmbeddings, chatDigests, chatSegments, documentChunks, imageEmbeddings } from "@orb/db";
import type { CharacterId, ChatId, DocumentId, EmbedGenerationId } from "@orb/kit/ids";
import { and, eq, gte, notInArray, or } from "drizzle-orm";
import type { VectorTable } from "../contract/params.ts";

function assertNever(value: never): never {
  throw new Error(`clearVectorTable: unhandled vector table ${String(value)}`);
}

// FLAG[PD-104]: DEAD — `clearVectorTable` (the whole-table wipe) has ZERO runtime consumers (test-only,
// PD-103-style). The OLD-space reclaim it was kept beside is no longer here: the model-scoped
// `purgeStaleVectors` was deleted with the generation cutover (#2496), because promotion now retires
// every non-active generation inside ONE transaction (`persistence/space-state.ts`
// `retiredVectorStatements`) — `generation_id` is NOT NULL on all five vector tables, so a `!= active`
// delete reaches every row the model-scoped predicate used to. Delete this + the `clearTable`
// verb/param/service-method + their tests once file-removal tooling is in hand (this pass is
// Edit-only). Registry row: Core-Audits-and-Debt.md PD-104.
/** Dispatch is assertNever-exhaustive over {@link VectorTable} — a new table fails tsc until its arm lands. */
export async function clearVectorTable(db: Db, table: VectorTable): Promise<void> {
  switch (table) {
    case "character_embeddings":
      await db.delete(characterEmbeddings);
      return;
    case "image_embeddings":
      await db.delete(imageEmbeddings);
      return;
    case "chat_digests":
      await db.delete(chatDigests);
      return;
    case "chat_segments":
      await db.delete(chatSegments);
      return;
    case "document_chunks":
      await db.delete(documentChunks);
      return;
    default:
      assertNever(table);
  }
}

/** The chat-memory SHRINK seam (stickler 2026-08-08 canon-message-identity, leg-2 refutation) — the
 *  `pruneDocumentChunks` idiom for `chat_digests`. Memory's blocks are sliced by POSITION and stored keyed
 *  `(tier, blockIdx)`, so when the ingest set shrinks (a host hides a trailing span, rows are deleted, a
 *  compaction cutoff moves) the trailing block stops being produced — and the content-hash self-heal CANNOT
 *  reach it, because that heal only ever re-summarizes a block that still EXISTS. Nothing else deletes it, so
 *  a digest summarized verbatim FROM the removed rows stayed recallable. This is the delete that closes it.
 *
 *  `keepPerTier[k]` is the surviving block COUNT at tier k, so every row with `blockIdx >= keepPerTier[tier]`
 *  is beyond canon and goes; a tier with no entry (beyond the configured ceiling) is left alone rather than
 *  wiped, since it is out of this pass's authority. The upward CASCADE falls out of the counts the caller
 *  derives: a tier-(k+1) parent exists only over a COMPLETE fanOut group, so a shrink at tier 0 lowers every
 *  ceiling above it and the consolidation that folded a pruned block is pruned by the same DELETE.
 *  `chat_digest_speakers` rows follow via their FK CASCADE — no orphan join rows.
 *
 *  Scope-keyed (`scopedCharacterId`), because a shrink is per-bucket: the witnessing filter means two buckets
 *  legitimately hold different block sets. Returns the count deleted. Store-then-prune, like its sibling. */
export async function pruneChatDigests(
  db: Db,
  chatId: ChatId,
  scopedCharacterId: CharacterId,
  target: { readonly keepPerTier: readonly number[]; readonly generationId?: EmbedGenerationId },
): Promise<number> {
  const { keepPerTier, generationId } = target;
  if (keepPerTier.length === 0) {
    return 0;
  }
  const beyondCanon = keepPerTier.map((keep, tier) => and(eq(chatDigests.tier, tier), gte(chatDigests.blockIdx, keep)));
  const rows = await db
    .delete(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, chatId),
        eq(chatDigests.scopedCharacterId, scopedCharacterId),
        generationId === undefined ? undefined : eq(chatDigests.generationId, generationId),
        or(...beyondCanon),
      ),
    )
    .returning({ id: chatDigests.id });
  return rows.length;
}

/** THE STALENESS INVALIDATION (#1395) — the third memory delete, and the one the other two structurally
 *  cannot cover. `pruneChatDigests` reclaims blocks that no longer EXIST; the content-hash self-heal
 *  re-summarizes blocks whose content CHANGED. Neither answers the third state: a block that still exists,
 *  whose hash mismatch already PROVED the stored digest stale, and whose re-summarize came back empty (a
 *  provider failure, a blank result, a bodyless arc). The build skips storing — correctly, a blank digest
 *  keyed by the new hash would skip forever — but the pre-existing row stayed live, and `loadDigestsForScope`
 *  has no currency filter to recognise it. Recall therefore kept serving a digest the build had already
 *  judged out of date, for as long as the summarizer kept failing.
 *
 *  So the KNOWN-stale row is deleted instead. Losing the block from recall until a later pass succeeds is
 *  the honest degrade: memory says less rather than saying something the canon has moved past. Bounded by
 *  construction — the caller passes only the keys whose re-digest it attempted and abandoned. Scope-keyed
 *  like its sibling, and `chat_digest_speakers` follows the FK CASCADE.
 *
 *  EACH KEY CARRIES THE HASH IT PROVED STALE, and the DELETE matches on it (#1543). Without that predicate
 *  the statement deletes "whatever is at this position now", and the position is not the row: the corpus
 *  backfill and the live per-turn build run over the same buckets, so a sibling pass can land a FRESH digest
 *  for this key between this pass's failed summarize and this delete — and the un-predicated delete would
 *  throw away the good row, leaving the block absent from recall until yet another pass rebuilt it. Matching
 *  the stale hash makes the delete a compare-and-swap: it removes exactly the row this pass judged, or
 *  nothing. A caller with no stored row for a key simply omits it (there is nothing to invalidate). */
export async function dropChatDigestKeys(
  db: Db,
  chatId: ChatId,
  scopedCharacterId: CharacterId,
  target: {
    readonly keys: readonly { readonly tier: number; readonly blockIdx: number; readonly staleHash: string }[];
    readonly generationId?: EmbedGenerationId;
  },
): Promise<number> {
  const { keys, generationId } = target;
  if (keys.length === 0) {
    return 0;
  }
  const targeted = keys.map((k) => and(eq(chatDigests.tier, k.tier), eq(chatDigests.blockIdx, k.blockIdx), eq(chatDigests.contentHash, k.staleHash)));
  const rows = await db
    .delete(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, chatId),
        eq(chatDigests.scopedCharacterId, scopedCharacterId),
        generationId === undefined ? undefined : eq(chatDigests.generationId, generationId),
        or(...targeted),
      ),
    )
    .returning({ id: chatDigests.id });
  return rows.length;
}

/** The `chat_segments` twin of {@link pruneChatDigests}. Segments are single-tier and chat-wide (NOT
 *  scope-keyed), so the BLOCK shrink is one ceiling: every block beyond `keepBlockCount` indexes canon rows
 *  that are no longer ingested. A stale segment is worse than dead weight — it carries a `(seqStart, seqEnd)`
 *  span the recall witnessing filter resolves digests through.
 *
 *  SINCE #172 a block is a ROW SET (chunks), so there is a SECOND ceiling: a block that used to need 5 chunks
 *  and now needs 2 (its content shrank, or the embed window grew) would strand chunks 2-4, still recallable
 *  and still claiming spans. `chunkCounts` carries the per-block ceiling for every block whose count is not
 *  1 — including `0` for a block past the pathological ceiling, which reclaims its whole set. Every block NOT
 *  listed holds exactly one chunk, so `chunkIdx >= 1` is stale there; that is what keeps this DELETE at
 *  `1 + |exceptions|` terms instead of one per block. */
export async function pruneChatSegments(
  db: Db,
  chatId: ChatId,
  target: {
    readonly keepBlockCount: number;
    readonly chunkCounts: readonly { readonly blockIdx: number; readonly chunkCount: number }[];
    readonly generationId?: EmbedGenerationId;
  },
): Promise<number> {
  const { keepBlockCount, chunkCounts, generationId } = target;
  const exceptions = chunkCounts.map((c) => and(eq(chatSegments.blockIdx, c.blockIdx), gte(chatSegments.chunkIdx, c.chunkCount)));
  const singleChunkBlocks =
    chunkCounts.length === 0
      ? gte(chatSegments.chunkIdx, 1)
      : and(
          gte(chatSegments.chunkIdx, 1),
          notInArray(
            chatSegments.blockIdx,
            chunkCounts.map((c) => c.blockIdx),
          ),
        );
  const rows = await db
    .delete(chatSegments)
    .where(
      and(
        eq(chatSegments.chatId, chatId),
        generationId === undefined ? undefined : eq(chatSegments.generationId, generationId),
        or(gte(chatSegments.blockIdx, keepBlockCount), singleChunkBlocks, ...exceptions),
      ),
    )
    .returning({ id: chatSegments.id });
  return rows.length;
}

/** the reindex-shrink seam. After the ingest upserts a document's current chunks
 *  (hash-gated no-ops keep it cheap), this reclaims the strays: tail rows (`chunkIdx >= keepCount`, a shrunk
 *  chunk set) AND rows in a retired `(model)` space (`model != activeModel`), scoped to the one document.
 *  Returns the count deleted. Store-then-prune (never clear-then-store) preserves the no-op economy — a
 *  re-extract with unchanged text re-embeds nothing; the prune is one bounded DELETE. */
export async function pruneDocumentChunks(db: Db, documentId: DocumentId, keepCount: number, generationId: EmbedGenerationId): Promise<number> {
  const rows = await db
    .delete(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.generationId, generationId), gte(documentChunks.chunkIdx, keepCount)))
    .returning({ id: documentChunks.id });
  return rows.length;
}
