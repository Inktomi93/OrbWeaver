// domain/chat/memory/persistence/queries — memory's OWN db reads:
// the chat META (`maxSeq`), the INGESTIBLE canon a block is built from (slot ⋈ selected variant — D26, minus
// what must never be digested: see `loadCanonThroughSeq`), and the NON-vector
// digest/segment/speaker facets (staleness hashes + recall facets). QUERIES ONLY — NO vector WRITE (that is
// `embeddings.store`, the one write path), NO cosine (that is `search.*`), NO module-scope state. Memory READS
// the `chat_digests`/`chat_segments`/`chat_digest_speakers` facet columns it produced; the `embedding`/`model`/
// `dim`/`hubScore` vector columns are search's/discovery's and are NEVER selected here.

import { MEMORY_INGEST_KINDS } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, chatParticipants, chatSegments, messages, messageVariants } from "@orb/db";
import { projectBodyForSummary } from "@orb/kit/content";
import type { CharacterId, ChatDigestId, ChatId, EmbedGenerationId } from "@orb/kit/ids";
import { and, asc, eq, inArray, lte, max, min } from "drizzle-orm";
import type { DigestRow, MsgRow, WitnessInterval } from "../types.ts";

/** The chat's canon head (`max(messages.seq)`, 0 when empty) — the build cutoff (`maxSeq − verbatimWindow`)
 *  derives from it. The MEMORY meta read (kept minimal; the full chat-row read is the feature persistence's). */
export async function loadChatMeta(db: Db, chatId: ChatId): Promise<{ maxSeq: number }> {
  const rows = await db
    .select({ maxSeq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return { maxSeq: rows.at(0)?.maxSeq ?? 0 };
}

/** The canon a block is built from — every INGESTIBLE slot (seq ≤ `throughSeq`) ⋈ its SELECTED variant (D26),
 *  oldest→newest, projected to {@link MsgRow}. The build slices this into fixed `blockSize` blocks.
 *  `throughSeq` is the aged-out cutoff (`maxSeq − verbatimWindow`) — the protected tip is never read here.
 *
 *  THIS LOAD IS THE ONE INGEST DISPATCH. Everything derived from memory —
 *  digests, segments, the speaker joins, and therefore `{{memory}}` recall — comes through here, so the three
 *  exclusions live at this single site rather than N knob-reads downstream:
 *
 *   1. `excludedFromPrompt` rows are DROPPED — a row the host has hidden FROM THE PROMPT must not be digested,
 *      or recall could re-surface its content into the very prompt it was held out of. Compaction filters
 *      these too (`verbs/compaction.ts` — its marker is member-peekable, same reasoning); hidden means hidden
 *      EVERYWHERE derived.
 *   2. HIDDEN-CLASS SPANS are stripped from each body via `projectBodyForSummary` — the same summary-plane
 *      projection compaction applies. A digest is a durable artifact whose text lands in a shared prompt, so
 *      folding a `<lie>`'s covered truth into it re-opens the D110 §3.6 class. Cards collapse to their stub in
 *      the same pass, which the summarizer wanted anyway (it never ate the multi-KB blob).
 *      A row that is ENTIRELY hidden-class projects to an EMPTY body and is DELIBERATELY KEPT rather than
 *      dropped. It costs one labelled-but-empty line in the
 *      summarizer input; dropping it would cost block-position STABILITY, which is far more expensive than
 *      the noise: `blockIdx` is the storage key, so removing a row mid-history re-slices every block after it,
 *      changing every downstream hash and re-summarizing the rest of the chat — and, now that a shrink is
 *      reclaimed, pruning and rebuilding rows that were perfectly good. Compaction keeps the same shape for
 *      the same reason, so the two planes also stay consistent. No leak either way: the bytes are gone.
 *   3. Rows whose KIND is not memory-ingestible are excluded, DERIVED from `MESSAGE_KIND_POLICY`
 *      (`MEMORY_INGEST_KINDS`) rather than re-spelled: `standard`/`narrator` are story canon (a narrator
 *      recap is precisely what a digest wants), an OOC `comment` is not story.
 *
 *  THE STALENESS MACHINERY DOES NOT COVER A VANISHING BLOCK. "Hiding a row changes the block's content, so
 *  `blockHash` changes, so the block re-digests" is true for a block that still EXISTS and FALSE for a
 *  block that VANISHES — which is precisely what these exclusions do at the tail. Blocks are sliced by
 *  POSITION and stored keyed `(tier, blockIdx)`; hide a trailing span and the trailing block stops being
 *  produced, no surviving block's rows move, no hash changes, and the content-hash self-heal — which can only
 *  ever re-summarize a block that still exists — never fires. The orphaned digest, summarized verbatim FROM
 *  the rows just hidden, stayed in the pool and `{{memory}}` recall could still surface it. The shrink is
 *  therefore reclaimed EXPLICITLY: `generateDigests`/`generateSegments` call `embeddingsPruneBlocks` with the
 *  surviving per-tier block counts, which also cascades to the consolidation that folded a pruned block.
 *  Content CHANGE is still the hash's job; block DISAPPEARANCE is the prune's. */
export async function loadCanonThroughSeq(db: Db, chatId: ChatId, throughSeq: number): Promise<MsgRow[]> {
  const rows = await db
    .select({
      seq: messages.seq,
      role: messages.role,
      // The DECLARED purpose rides into the build: the transcript labeller dispatches on it rather than
      // inferring "narrator" from an attribution that is designed to degrade (D129(A)).
      kind: messages.kind,
      characterId: messages.characterId,
      authorUserId: messages.authorUserId,
      personaId: messages.personaId,
      content: messageVariants.content,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(
      and(eq(messages.chatId, chatId), lte(messages.seq, throughSeq), eq(messages.excludedFromPrompt, false), inArray(messages.kind, [...MEMORY_INGEST_KINDS])),
    )
    .orderBy(asc(messages.seq));
  return rows.map((r) => ({ ...r, content: projectBodyForSummary(r.content) }));
}

/** The `(tier:blockIdx) → content_hash` map for one scope bucket (the digest staleness gate — re-summarize a
 *  block iff missing or its hash changed). Keyed by the `${tier}:${blockIdx}` string the build looks up. */
export async function loadDigestHashes(db: Db, chatId: ChatId, scopedCharacterId: CharacterId, generationId: EmbedGenerationId): Promise<Map<string, string>> {
  const rows = await db
    .select({
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
      contentHash: chatDigests.contentHash,
    })
    .from(chatDigests)
    .where(and(eq(chatDigests.chatId, chatId), eq(chatDigests.scopedCharacterId, scopedCharacterId), eq(chatDigests.generationId, generationId)));
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for digest hashes. Ends if it outlives the call.
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(`${r.tier}:${r.blockIdx}`, r.contentHash);
  }
  return out;
}

/** The `${blockIdx}:${chunkIdx} → content_hash` map for a chat's segments (the segment staleness gate),
 *  keyed by the same string the build looks up — the `loadDigestHashes` idiom. Segments are NOT scope-keyed
 *  (shared per chat), and since #172 a block is a ROW SET: the gate is per CHUNK, which is also what makes a
 *  half-written block self-heal (the chunks that never landed have no row, so nothing skips them). */
export async function loadSegmentHashes(db: Db, chatId: ChatId, generationId: EmbedGenerationId): Promise<Map<string, string>> {
  const rows = await db
    .select({ blockIdx: chatSegments.blockIdx, chunkIdx: chatSegments.chunkIdx, contentHash: chatSegments.contentHash })
    .from(chatSegments)
    .where(and(eq(chatSegments.chatId, chatId), eq(chatSegments.generationId, generationId)));
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for segment hashes. Ends if it outlives the call.
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(`${r.blockIdx}:${r.chunkIdx}`, r.contentHash);
  }
  return out;
}

/** The NON-vector digest facets for one scope bucket (mixA's tier-0 read, tiered's all-tiers read, and the
 *  consolidation child read), ordered tier-asc then blockIdx-asc (chronological within a tier). `tier`
 *  filters to one tier when given (mixA = tier 0; the consolidation reads tier k). */
export async function loadDigestsForScope(
  db: Db,
  chatId: ChatId,
  scopedCharacterId: CharacterId,
  options?: { readonly tier?: number; readonly model?: string },
): Promise<DigestRow[]> {
  const { tier, model } = options ?? {};
  const where =
    tier === undefined
      ? and(
          eq(chatDigests.chatId, chatId),
          eq(chatDigests.scopedCharacterId, scopedCharacterId),
          ...(model === undefined ? [] : [eq(chatDigests.model, model)]),
        )
      : and(
          eq(chatDigests.chatId, chatId),
          eq(chatDigests.scopedCharacterId, scopedCharacterId),
          eq(chatDigests.tier, tier),
          ...(model === undefined ? [] : [eq(chatDigests.model, model)]),
        );
  const rows = await db
    .select({
      id: chatDigests.id,
      scopedCharacterId: chatDigests.scopedCharacterId,
      isGroup: chatDigests.isGroup,
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
      text: chatDigests.text,
      contentHash: chatDigests.contentHash,
      topicAnchor: chatDigests.topicAnchor,
      keywords: chatDigests.keywords,
    })
    .from(chatDigests)
    .where(where)
    .orderBy(asc(chatDigests.tier), asc(chatDigests.blockIdx));
  return rows;
}

/** The `digestId → contained character ids` map (the `chat_digest_speakers` join) for a set of digests — the
 *  consolidation unions its children's speakers up a tier. No-op (empty) on an empty id list. */
export async function loadDigestSpeakers(db: Db, digestIds: readonly ChatDigestId[]): Promise<Map<ChatDigestId, CharacterId[]>> {
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for digest speakers. Ends if it outlives the call.
  const out = new Map<ChatDigestId, CharacterId[]>();
  if (digestIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({ digestId: chatDigestSpeakers.digestId, characterId: chatDigestSpeakers.characterId })
    .from(chatDigestSpeakers)
    .where(inArray(chatDigestSpeakers.digestId, [...digestIds]));
  for (const r of rows) {
    const list = out.get(r.digestId) ?? [];
    list.push(r.characterId);
    out.set(r.digestId, list);
  }
  return out;
}

/** The join/leave WITNESSING horizons for one character in a chat (core/Knowledge-Cluster.md §4 / inv 12) — every
 *  `chat_participants` presence episode for `(chatId, characterId)`, joinSeq-ascending. A kick→re-add is two
 *  rows ⇒ two intervals (the kicked span is genuinely absent). The build/recall LOGIC takes these as data —
 *  this read is the engine's source (it never reaches into the LOGIC; determinism stays in the pure layer). */
export async function loadWitnessHorizons(db: Db, chatId: ChatId, characterId: CharacterId): Promise<WitnessInterval[]> {
  const rows = await db
    .select({ joinSeq: chatParticipants.joinSeq, leftSeq: chatParticipants.leftSeq })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)))
    .orderBy(asc(chatParticipants.joinSeq));
  return rows.map((r) => ({ joinSeq: r.joinSeq, leftSeq: r.leftSeq }));
}

/** The `blockIdx → seq-span` map for a chat's segments (the recall WITNESSING filter resolves a digest's
 *  block range to its `messages.seq` span via `chat_segments`, then tests it against the speaker's horizons —
 *  §4). Segments are chat-wide (not scope-keyed), so one map serves both the shared + scoped buckets.
 *
 *  AGGREGATED ACROSS CHUNKS (#172): a block is a row set, and the filter asks about the BLOCK's span, so the
 *  min/max fold is the honest answer (`min(seq_start)`, `max(seq_end)` over the block's chunks). Reading one
 *  arbitrary chunk's span instead would shrink a chunked block's witnessing window and hide real digests. */
export async function loadSegmentSpans(db: Db, chatId: ChatId): Promise<Map<number, { seqStart: number; seqEnd: number }>> {
  const rows = await db
    .select({
      blockIdx: chatSegments.blockIdx,
      seqStart: min(chatSegments.seqStart),
      seqEnd: max(chatSegments.seqEnd),
    })
    .from(chatSegments)
    .where(eq(chatSegments.chatId, chatId))
    .groupBy(chatSegments.blockIdx);
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for segment spans. Ends if it outlives the call.
  const out = new Map<number, { seqStart: number; seqEnd: number }>();
  for (const r of rows) {
    if (r.seqStart !== null && r.seqEnd !== null) {
      out.set(r.blockIdx, { seqStart: r.seqStart, seqEnd: r.seqEnd });
    }
  }
  return out;
}
