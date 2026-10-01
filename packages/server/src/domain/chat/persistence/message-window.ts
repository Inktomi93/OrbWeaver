import type { CorpusSource } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import { chatDigests, chatParticipants, chatSegments, embedGenerations, messages } from "@orb/db";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";

/** An anchor lookup always includes the room and the viewer's already-resolved history floor. */
export async function loadWindowAnchor(
  db: Db,
  chatId: ChatId,
  messageId: MessageId,
  floorSeq: number,
): Promise<{ readonly id: MessageId; readonly seq: number } | null> {
  const [row] = await db
    .select({ id: messages.id, seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, messageId), gte(messages.seq, floorSeq)))
    .limit(1);
  return row ?? null;
}

/** Surviving visible endpoints inside the source's original canon coverage. */
export async function loadWindowRange(
  db: Db,
  chatId: ChatId,
  { seqStart, seqEnd, floorSeq }: { readonly seqStart: number; readonly seqEnd: number; readonly floorSeq: number },
): Promise<{
  readonly first: { readonly id: MessageId; readonly seq: number } | null;
  readonly last: { readonly id: MessageId; readonly seq: number } | null;
}> {
  const where = and(eq(messages.chatId, chatId), gte(messages.seq, Math.max(seqStart, floorSeq)), lte(messages.seq, seqEnd));
  const [first, last] = await Promise.all([
    db.select({ id: messages.id, seq: messages.seq }).from(messages).where(where).orderBy(asc(messages.seq)).limit(1),
    db.select({ id: messages.id, seq: messages.seq }).from(messages).where(where).orderBy(desc(messages.seq)).limit(1),
  ]);
  return { first: first[0] ?? null, last: last[0] ?? null };
}

/** Only source metadata is read here; canon bytes pass through the ordinary member projection. */
export async function loadWindowSource(
  db: Db,
  chatId: ChatId,
  source: CorpusSource,
): Promise<{ readonly generationFingerprint: string | null; readonly contentHash: string | null; readonly sourceSpanMatches: boolean }> {
  const [generation] = await db
    .select({ fingerprint: embedGenerations.fingerprint })
    .from(embedGenerations)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        isNull(chatParticipants.leftSeq),
        eq(chatParticipants.userId, embedGenerations.ownerId),
      ),
    )
    .where(eq(embedGenerations.id, source.generationId))
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
