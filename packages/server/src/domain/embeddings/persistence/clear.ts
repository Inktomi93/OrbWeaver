// domain/embeddings/persistence/clear — the typed DELETE FROM over a primary vector table.
//
// A plain DELETE FROM is safe here because there is no ANN/DiskANN shadow index over these F32_BLOB
// columns — search is an exact ORDER BY vector_distance_cos(...) scan. If a libSQL ANN index is ever
// added, this comment is the tripwire: a bare DELETE would then desync the shadow index.

import type { Db } from "@orb/db";
import { characterEmbeddings, chatDigests, chatSegments, documentChunks, imageEmbeddings } from "@orb/db";
import type { CharacterId, ChatId, DocumentId } from "@orb/kit/ids";
import { and, eq, gte, ne, or } from "drizzle-orm";
import type { VectorTable } from "../contract/params.ts";

function assertNever(value: never): never {
  throw new Error(`clearVectorTable: unhandled vector table ${String(value)}`);
}

// FLAG[PD-104]: DEAD — `clearVectorTable` (the whole-table wipe) has ZERO runtime consumers (test-only,
// PD-103-style). Superseded by `purgeStaleVectors` below (the model-scoped OLD-space reclaim that the
// PD-104 purge+reindex path actually needs — a full wipe would also nuke the NEW space). Delete this +
// the `clearTable` verb/param/service-method + their tests once file-removal tooling is in hand (this
// pass is Edit-only). Registry row: Core-Audits-and-Debt.md PD-104.
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

/** PD-104 — the OLD-vector-space reclaim half of purge+reindex. Deletes every row in `table` whose `model`
 *  differs from `activeModel` (the box's single active embed/imageEmbed model — a stale-space row is stale
 *  for every owner, so the purge is global). Returns the number of rows purged. The reindex half writes the
 *  new space FIRST (uniform `(…, model)` upsert keys, so the two spaces coexist), then this reclaims the old
 *  one — no row is ever stranded. Exhaustive over {@link VectorTable} (a new table fails tsc until its arm
 *  lands). Called in BULK mode only (a model change is a box-level event → a bulk reindex; a singular
 *  per-owner catch-up must not delete the global old space). */
export async function purgeStaleVectors(db: Db, table: VectorTable, activeModel: string): Promise<number> {
  switch (table) {
    case "character_embeddings": {
      const rows = await db.delete(characterEmbeddings).where(ne(characterEmbeddings.model, activeModel)).returning({ id: characterEmbeddings.id });
      return rows.length;
    }
    case "image_embeddings": {
      const rows = await db.delete(imageEmbeddings).where(ne(imageEmbeddings.model, activeModel)).returning({ id: imageEmbeddings.id });
      return rows.length;
    }
    case "chat_digests": {
      const rows = await db.delete(chatDigests).where(ne(chatDigests.model, activeModel)).returning({ id: chatDigests.id });
      return rows.length;
    }
    case "chat_segments": {
      const rows = await db.delete(chatSegments).where(ne(chatSegments.model, activeModel)).returning({ id: chatSegments.id });
      return rows.length;
    }
    case "document_chunks": {
      const rows = await db.delete(documentChunks).where(ne(documentChunks.model, activeModel)).returning({ id: documentChunks.id });
      return rows.length;
    }
    default:
      return assertNever(table);
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
export async function pruneChatDigests(db: Db, chatId: ChatId, scopedCharacterId: CharacterId, keepPerTier: readonly number[]): Promise<number> {
  if (keepPerTier.length === 0) {
    return 0;
  }
  const beyondCanon = keepPerTier.map((keep, tier) => and(eq(chatDigests.tier, tier), gte(chatDigests.blockIdx, keep)));
  const rows = await db
    .delete(chatDigests)
    .where(and(eq(chatDigests.chatId, chatId), eq(chatDigests.scopedCharacterId, scopedCharacterId), or(...beyondCanon)))
    .returning({ id: chatDigests.id });
  return rows.length;
}

/** The `chat_segments` twin of {@link pruneChatDigests}. Segments are single-tier and chat-wide (NOT
 *  scope-keyed — `chat_segments` is `(chatId, blockIdx)`), so the shrink is one ceiling: every block beyond
 *  `keepBlockCount` indexes canon rows that are no longer ingested. A stale segment is worse than dead
 *  weight — it carries a `(seqStart, seqEnd)` span the recall witnessing filter resolves digests through. */
export async function pruneChatSegments(db: Db, chatId: ChatId, keepBlockCount: number): Promise<number> {
  const rows = await db
    .delete(chatSegments)
    .where(and(eq(chatSegments.chatId, chatId), gte(chatSegments.blockIdx, keepBlockCount)))
    .returning({ id: chatSegments.id });
  return rows.length;
}

/** databank-design/05 §2.4 — the reindex-shrink seam. After the ingest upserts a document's current chunks
 *  (hash-gated no-ops keep it cheap), this reclaims the strays: tail rows (`chunkIdx >= keepCount`, a shrunk
 *  chunk set) AND rows in a retired `(model)` space (`model != activeModel`), scoped to the one document.
 *  Returns the count deleted. Store-then-prune (never clear-then-store) preserves the no-op economy — a
 *  re-extract with unchanged text re-embeds nothing; the prune is one bounded DELETE. */
export async function pruneDocumentChunks(db: Db, documentId: DocumentId, keepCount: number, activeModel: string): Promise<number> {
  const rows = await db
    .delete(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), or(gte(documentChunks.chunkIdx, keepCount), ne(documentChunks.model, activeModel))))
    .returning({ id: documentChunks.id });
  return rows.length;
}
