import type { CorpusSource, CorpusSourceState } from "@orb/contracts/search";
import type { ReadOnlyDb } from "@orb/db";
import { characters, chatDigests, chatParticipants, chatSegments, chats, embedGenerations, messages } from "@orb/db";
import type { ChatDigestId, ChatId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, min, or } from "drizzle-orm";
import type { DigestSourceRow } from "../contract/results.ts";
import { SOURCE_LINEAGE_LIMIT } from "../substrate/constants.ts";

/** Generation-scoped canon coverage, including every chunk of a represented tier-zero block. */
export async function readSourceSpan(
  db: ReadOnlyDb,
  { chatId, generationId }: { readonly chatId: ChatId; readonly generationId: EmbedGenerationId },
  range: { readonly startIdx: number; readonly endIdx: number },
  floorSeq: number | null = 0,
): Promise<Pick<CorpusSource, "seqStart" | "seqEnd" | "messageStartId" | "messageEndId">> {
  const count = range.endIdx - range.startIdx + 1;
  if (count > SOURCE_LINEAGE_LIMIT) {
    return await readSourceAnchors(db, chatId, { seqStart: null, seqEnd: null });
  }
  const spans = await db
    .select({ blockIdx: chatSegments.blockIdx, seqStart: min(chatSegments.seqStart), seqEnd: max(chatSegments.seqEnd) })
    .from(chatSegments)
    .where(
      and(
        eq(chatSegments.chatId, chatId),
        eq(chatSegments.generationId, generationId),
        gte(chatSegments.blockIdx, range.startIdx),
        lte(chatSegments.blockIdx, range.endIdx),
      ),
    )
    .groupBy(chatSegments.blockIdx)
    .limit(SOURCE_LINEAGE_LIMIT);
  if (spans.length !== count) {
    return await readSourceAnchors(db, chatId, { seqStart: null, seqEnd: null });
  }
  const starts = spans.flatMap((span) => (span.seqStart === null ? [] : [span.seqStart]));
  const ends = spans.flatMap((span) => (span.seqEnd === null ? [] : [span.seqEnd]));
  return await readSourceAnchors(db, chatId, { seqStart: Math.min(...starts), seqEnd: Math.max(...ends) }, floorSeq);
}

/** Stable endpoints supplement sequence coverage when source rows are replaced or removed. */
export async function readSourceAnchors(
  db: ReadOnlyDb,
  chatId: ChatId,
  { seqStart, seqEnd }: { readonly seqStart: number | null; readonly seqEnd: number | null },
  floorSeq: number | null = 0,
): Promise<Pick<CorpusSource, "seqStart" | "seqEnd" | "messageStartId" | "messageEndId">> {
  if (floorSeq === null || seqStart === null || seqEnd === null) {
    return { seqStart, seqEnd, messageStartId: null, messageEndId: null };
  }
  const where = and(eq(messages.chatId, chatId), gte(messages.seq, Math.max(seqStart, floorSeq)), lte(messages.seq, seqEnd));
  const [first, last] = await Promise.all([
    db.select({ id: messages.id }).from(messages).where(where).orderBy(asc(messages.seq)).limit(1),
    db.select({ id: messages.id }).from(messages).where(where).orderBy(desc(messages.seq)).limit(1),
  ]);
  return { seqStart, seqEnd, messageStartId: first[0]?.id ?? null, messageEndId: last[0]?.id ?? null };
}

export async function readOwnedDigestSourceRows(db: ReadOnlyDb, ownerId: UserId, ids: readonly ChatDigestId[]): Promise<DigestSourceRow[]> {
  if (ids.length === 0) {
    return [];
  }
  return await db
    .select({
      id: chatDigests.id,
      chatId: chatDigests.chatId,
      generationId: chatDigests.generationId,
      fingerprint: embedGenerations.fingerprint,
      contentHash: chatDigests.contentHash,
      blockIdx: chatDigests.blockIdx,
      tier: chatDigests.tier,
      scopedCharacterId: chatDigests.scopedCharacterId,
      text: chatDigests.text,
      chatTitle: chats.title,
      scopedCharacterName: characters.name,
    })
    .from(chatDigests)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatDigests.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .innerJoin(chats, eq(chats.id, chatDigests.chatId))
    .innerJoin(characters, eq(characters.id, chatDigests.scopedCharacterId))
    .leftJoin(embedGenerations, eq(embedGenerations.id, chatDigests.generationId))
    .where(inArray(chatDigests.id, [...ids]))
    .orderBy(asc(chatDigests.chatId), asc(chatDigests.tier), asc(chatDigests.blockIdx), asc(chatDigests.id));
}

/** Coverage proof reads only hashes, bounded before a high-tier lineage can become an unbounded response. */
export async function readDigestSourceLineage(
  db: ReadOnlyDb,
  source: Pick<Extract<CorpusSource, { kind: "digest" }>, "chatId" | "generationId" | "scopedCharacterId" | "tier" | "blockIdx">,
  ranges: readonly { readonly tier: number; readonly startIdx: number; readonly endIdx: number }[],
  limit: number,
): Promise<Pick<typeof chatDigests.$inferSelect, "tier" | "blockIdx" | "contentHash">[]> {
  return await db
    .select({ tier: chatDigests.tier, blockIdx: chatDigests.blockIdx, contentHash: chatDigests.contentHash })
    .from(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, source.chatId),
        eq(chatDigests.generationId, source.generationId),
        eq(chatDigests.scopedCharacterId, source.scopedCharacterId),
        or(...ranges.map((range) => and(eq(chatDigests.tier, range.tier), gte(chatDigests.blockIdx, range.startIdx), lte(chatDigests.blockIdx, range.endIdx)))),
      ),
    )
    .limit(limit);
}

/** Only source metadata is read here; canon bytes pass through the ordinary member projection. */
export async function readCorpusSourceState(db: ReadOnlyDb, source: CorpusSource): Promise<CorpusSourceState> {
  const chatId = source.chatId;
  const [generation] = await db
    .select({ fingerprint: embedGenerations.fingerprint })
    .from(embedGenerations)
    .innerJoin(
      chatParticipants,
      and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)),
    )
    .where(and(eq(embedGenerations.id, source.generationId), eq(embedGenerations.ownerId, chatParticipants.userId)))
    .limit(1);
  if (source.kind === "segment") {
    const [row] = await db
      .select({ contentHash: chatSegments.contentHash, seqStart: chatSegments.seqStart, seqEnd: chatSegments.seqEnd })
      .from(chatSegments)
      .where(
        and(
          eq(chatSegments.chatId, chatId),
          eq(chatSegments.id, source.rowId),
          eq(chatSegments.generationId, source.generationId),
          eq(chatSegments.blockIdx, source.blockIdx),
          eq(chatSegments.chunkIdx, source.chunkIdx),
        ),
      )
      .limit(1);
    return {
      generationFingerprint: generation?.fingerprint ?? null,
      contentHash: row?.contentHash ?? null,
      sourceSpanMatches: row !== undefined && row.seqStart === source.seqStart && row.seqEnd === source.seqEnd,
    };
  }
  const [row] = await db
    .select({ contentHash: chatDigests.contentHash })
    .from(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, chatId),
        eq(chatDigests.id, source.rowId),
        eq(chatDigests.generationId, source.generationId),
        eq(chatDigests.blockIdx, source.blockIdx),
        eq(chatDigests.tier, source.tier),
        eq(chatDigests.scopedCharacterId, source.scopedCharacterId),
      ),
    )
    .limit(1);
  return { generationFingerprint: generation?.fingerprint ?? null, contentHash: row?.contentHash ?? null, sourceSpanMatches: true };
}
