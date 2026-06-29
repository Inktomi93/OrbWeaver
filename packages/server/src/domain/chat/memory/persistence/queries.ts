// domain/chat/memory/persistence/queries — memory's OWN db reads (chat.md Part I §memory `persistence/`):
// the chat META (`maxSeq`), the canon a block is built from (slot ⋈ selected variant — D26), and the NON-vector
// digest/segment/speaker facets (staleness hashes + recall facets). QUERIES ONLY — NO vector WRITE (that is
// `embeddings.store`, the one write path), NO cosine (that is `search.*`), NO module-scope state. Memory READS
// the `chat_digests`/`chat_segments`/`chat_digest_speakers` facet columns it produced; the `embedding`/`model`/
// `dim`/`hubScore` vector columns are search's/discovery's and are NEVER selected here.

import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, chatSegments, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatDigestId, ChatId } from "@orb/kit/ids";
import { and, asc, eq, inArray, lte, max } from "drizzle-orm";
import type { DigestRow, MsgRow } from "../types";

/** The chat's canon head (`max(messages.seq)`, 0 when empty) — the build cutoff (`maxSeq − verbatimWindow`)
 *  derives from it. The MEMORY meta read (kept minimal; the full chat-row read is the feature persistence's). */
export async function loadChatMeta(db: Db, chatId: ChatId): Promise<{ maxSeq: number }> {
  const rows = await db
    .select({ maxSeq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return { maxSeq: rows.at(0)?.maxSeq ?? 0 };
}

/** The canon a block is built from — every slot (seq ≤ `throughSeq`) ⋈ its SELECTED variant (D26), oldest→
 *  newest, projected to {@link MsgRow}. The build slices this into fixed `blockSize` blocks. `throughSeq` is
 *  the aged-out cutoff (`maxSeq − verbatimWindow`) — the protected tip is never read here. */
export async function loadCanonThroughSeq(
  db: Db,
  chatId: ChatId,
  throughSeq: number,
): Promise<MsgRow[]> {
  return await db
    .select({
      seq: messages.seq,
      role: messages.role,
      characterId: messages.characterId,
      authorUserId: messages.authorUserId,
      content: messageVariants.content,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), lte(messages.seq, throughSeq)))
    .orderBy(asc(messages.seq));
}

/** The `(tier:blockIdx) → content_hash` map for one scope bucket (the digest staleness gate — re-summarize a
 *  block iff missing or its hash changed). Keyed by the `${tier}:${blockIdx}` string the build looks up. */
export async function loadDigestHashes(
  db: Db,
  chatId: ChatId,
  scopedCharacterId: CharacterId | "",
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
      contentHash: chatDigests.contentHash,
    })
    .from(chatDigests)
    .where(
      and(eq(chatDigests.chatId, chatId), eq(chatDigests.scopedCharacterId, scopedCharacterId)),
    );
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(`${r.tier}:${r.blockIdx}`, r.contentHash);
  }
  return out;
}

/** The `blockIdx → content_hash` map for a chat's segments (the segment staleness gate). Segments are NOT
 *  scope-keyed (shared per chat). */
export async function loadSegmentHashes(db: Db, chatId: ChatId): Promise<Map<number, string>> {
  const rows = await db
    .select({ blockIdx: chatSegments.blockIdx, contentHash: chatSegments.contentHash })
    .from(chatSegments)
    .where(eq(chatSegments.chatId, chatId));
  const out = new Map<number, string>();
  for (const r of rows) {
    out.set(r.blockIdx, r.contentHash);
  }
  return out;
}

/** The NON-vector digest facets for one scope bucket (mixA's tier-0 read, tiered's all-tiers read, and the
 *  consolidation child read), ordered tier-asc then blockIdx-asc (chronological within a tier). `tier`
 *  filters to one tier when given (mixA = tier 0; the consolidation reads tier k). */
export async function loadDigestsForScope(
  db: Db,
  chatId: ChatId,
  scopedCharacterId: CharacterId | "",
  tier?: number,
): Promise<DigestRow[]> {
  const where =
    tier === undefined
      ? and(eq(chatDigests.chatId, chatId), eq(chatDigests.scopedCharacterId, scopedCharacterId))
      : and(
          eq(chatDigests.chatId, chatId),
          eq(chatDigests.scopedCharacterId, scopedCharacterId),
          eq(chatDigests.tier, tier),
        );
  const rows = await db
    .select({
      id: chatDigests.id,
      scopedCharacterId: chatDigests.scopedCharacterId,
      isGroup: chatDigests.isGroup,
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
      contentHash: chatDigests.contentHash,
      topicAnchor: chatDigests.topicAnchor,
      keywords: chatDigests.keywords,
    })
    .from(chatDigests)
    .where(where)
    .orderBy(asc(chatDigests.tier), asc(chatDigests.blockIdx));
  return rows.map((r) => ({ ...r, scopedCharacterId: r.scopedCharacterId as CharacterId | "" }));
}

/** The `digestId → contained character ids` map (the `chat_digest_speakers` join) for a set of digests — the
 *  consolidation unions its children's speakers up a tier. No-op (empty) on an empty id list. */
export async function loadDigestSpeakers(
  db: Db,
  digestIds: readonly ChatDigestId[],
): Promise<Map<ChatDigestId, CharacterId[]>> {
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
