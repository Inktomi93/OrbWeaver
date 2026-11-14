// domain/chat/memory/persistence/strikes — the host's strikes on remembered items, and the span resolution that ties
// a stored digest to the messages it covers. A strike names its item by bucket, tier and the covered span's endpoint
// message ids (`chat_memory_strikes` in `packages/db/src/schema/chat.ts` holds why); this file reads and writes those
// rows and resolves a digest's endpoints the way recall's witnessing filter resolves its span: through the block's
// stored segments, then to the message at each end.

import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, chatMemoryStrikes, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { CharacterId, ChatDigestId, ChatId, ChatMemoryStrikeId, MessageId } from "@orb/kit/ids";
import type { RecallStrike, StrikeCandidate } from "@orb/kit/recall";
import { tier0RangeOf } from "@orb/kit/recall";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DigestRow } from "../types.ts";
import { loadSegmentSpans } from "./queries.ts";

const LIMIT_ONE = 1;

/** The stored hash of a strike a bundle restored: this box never saw the digest it struck, so the view cannot say
 *  whether the scene changed since, and the strike matches by its endpoints alone. */
export const IMPORTED_STRIKE_HASH = "";

/** One stored strike, with what the view lists for it. */
export interface StoredMemoryStrike extends RecallStrike {
  readonly id: ChatMemoryStrikeId;
  readonly topicAnchor: string | null;
}

/** The room's strikes, oldest first. */
export async function loadMemoryStrikes(db: Db, chatId: ChatId): Promise<StoredMemoryStrike[]> {
  return await db
    .select({
      id: chatMemoryStrikes.id,
      scopedCharacterId: chatMemoryStrikes.scopedCharacterId,
      tier: chatMemoryStrikes.tier,
      messageStartId: chatMemoryStrikes.messageStartId,
      messageEndId: chatMemoryStrikes.messageEndId,
      contentHash: chatMemoryStrikes.contentHash,
      topicAnchor: chatMemoryStrikes.topicAnchor,
    })
    .from(chatMemoryStrikes)
    .where(eq(chatMemoryStrikes.chatId, chatId))
    .orderBy(asc(chatMemoryStrikes.createdAt), asc(chatMemoryStrikes.id));
}

/** A stored digest with the parts the memory view lists. */
export interface StoredDigest extends DigestRow {
  readonly topicAnchor: string | null;
  readonly keywords: readonly string[];
}

const storedDigestColumns = {
  id: chatDigests.id,
  scopedCharacterId: chatDigests.scopedCharacterId,
  tier: chatDigests.tier,
  blockIdx: chatDigests.blockIdx,
  text: chatDigests.text,
  contentHash: chatDigests.contentHash,
  topicAnchor: chatDigests.topicAnchor,
  keywords: chatDigests.keywords,
};

/** A digest with its resolved span: the seqs it covers and the message ids at both ends. */
export type ResolvedDigest<R extends DigestRow> = R & StrikeCandidate & { readonly seqSpan: { readonly seqStart: number; readonly seqEnd: number } | null };

/** Resolve each digest's covered span to its seq range and endpoint message ids. A digest whose first or last
 *  tier-0 block has no stored segment, or whose endpoint seq names no message now, resolves to a null span. */
export async function resolveDigestSpans<R extends DigestRow>(db: Db, chatId: ChatId, rows: readonly R[], fanOut: number): Promise<ResolvedDigest<R>[]> {
  if (rows.length === 0) {
    return [];
  }
  const spans = await loadSegmentSpans(db, chatId);
  const seqSpans = rows.map((row) => {
    const range = tier0RangeOf(fanOut, row.tier, row.blockIdx);
    const first = spans.get(range.startIdx);
    const last = spans.get(range.endIdx);
    return first === undefined || last === undefined ? null : { seqStart: first.seqStart, seqEnd: last.seqEnd };
  });
  const seqs = [...new Set(seqSpans.flatMap((span) => (span === null ? [] : [span.seqStart, span.seqEnd])))];
  const idAt = new Map<number, MessageId>();
  if (seqs.length > 0) {
    const found = await db
      .select({ id: messages.id, seq: messages.seq })
      .from(messages)
      .where(and(eq(messages.chatId, chatId), inArray(messages.seq, seqs)));
    for (const message of found) {
      idAt.set(message.seq, message.id);
    }
  }
  return rows.map((row, index) => {
    const seqSpan = seqSpans[index] ?? null;
    const startId = seqSpan === null ? undefined : idAt.get(seqSpan.seqStart);
    const endId = seqSpan === null ? undefined : idAt.get(seqSpan.seqEnd);
    return { ...row, seqSpan, span: startId === undefined || endId === undefined ? null : { startId, endId } };
  });
}

/** The stored digest at one grid key, or undefined. Any generation answers: a key names one item whatever space
 *  embedded it, and the newest row wins when a model move left two. */
export async function loadDigestAt(
  db: Db,
  chatId: ChatId,
  key: { readonly tier: number; readonly blockIdx: number; readonly scopedCharacterId: CharacterId },
): Promise<StoredDigest | undefined> {
  const rows = await db
    .select(storedDigestColumns)
    .from(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, chatId),
        eq(chatDigests.scopedCharacterId, key.scopedCharacterId),
        eq(chatDigests.tier, key.tier),
        eq(chatDigests.blockIdx, key.blockIdx),
      ),
    )
    .orderBy(asc(chatDigests.createdAt), asc(chatDigests.id));
  return rows.at(-1);
}

/** Every stored item of the room, one per grid key: when a model move left two generations at a key, the newest
 *  answers, as in {@link loadDigestAt}. Ordered by bucket, tier and position. */
export async function loadRoomDigests(db: Db, chatId: ChatId): Promise<StoredDigest[]> {
  const rows = await db
    .select(storedDigestColumns)
    .from(chatDigests)
    .where(eq(chatDigests.chatId, chatId))
    .orderBy(asc(chatDigests.scopedCharacterId), asc(chatDigests.tier), asc(chatDigests.blockIdx), asc(chatDigests.createdAt), asc(chatDigests.id));
  const byKey = new Map<string, StoredDigest>();
  for (const row of rows) {
    byKey.set(`${row.scopedCharacterId}:${row.tier}:${row.blockIdx}`, row);
  }
  return [...byKey.values()];
}

/** The first message the newest reply read word for word, with its seq: the boundary its fit stamped on the
 *  selected variant. Null when no reply has run or the reply read the whole history. */
export async function loadRecentWindowStart(db: Db, chatId: ChatId): Promise<{ readonly id: MessageId; readonly seq: number } | null> {
  const [reply] = await db
    .select({ boundaryId: messageVariants.contextBoundaryMessageId })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  const boundaryId = reply?.boundaryId ?? null;
  if (boundaryId === null) {
    return null;
  }
  const [boundary] = await db
    .select({ id: messages.id, seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, boundaryId)))
    .limit(LIMIT_ONE);
  return boundary ?? null;
}

/** The characters each digest contains (the typed speaker join). */
export async function loadSpeakersOf(db: Db, digestIds: readonly ChatDigestId[]): Promise<Map<ChatDigestId, CharacterId[]>> {
  const out = new Map<ChatDigestId, CharacterId[]>();
  if (digestIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({ digestId: chatDigestSpeakers.digestId, characterId: chatDigestSpeakers.characterId })
    .from(chatDigestSpeakers)
    .where(inArray(chatDigestSpeakers.digestId, [...digestIds]));
  for (const row of rows) {
    out.set(row.digestId, [...(out.get(row.digestId) ?? []), row.characterId]);
  }
  return out;
}

/** The new strike row; the verb mints the id and stamps the time from its injected clock. */
export interface MemoryStrikeInsert extends RecallStrike {
  readonly id: ChatMemoryStrikeId;
  readonly chatId: ChatId;
  readonly topicAnchor: string | null;
  readonly createdAt: number;
}

/** Insert a strike unless the same item is already struck. Returns true when a row landed. */
export async function insertMemoryStrike(db: Db, row: MemoryStrikeInsert): Promise<boolean> {
  const inserted = await db.insert(chatMemoryStrikes).values(row).onConflictDoNothing().returning({ id: chatMemoryStrikes.id });
  return inserted.length > 0;
}

/** The strike already standing on an item, matched by its identity columns. */
export async function findMemoryStrike(db: Db, chatId: ChatId, strike: Omit<RecallStrike, "contentHash">): Promise<StoredMemoryStrike | undefined> {
  const bucket =
    strike.scopedCharacterId === null ? isNull(chatMemoryStrikes.scopedCharacterId) : eq(chatMemoryStrikes.scopedCharacterId, strike.scopedCharacterId);
  const rows = await db
    .select({
      id: chatMemoryStrikes.id,
      scopedCharacterId: chatMemoryStrikes.scopedCharacterId,
      tier: chatMemoryStrikes.tier,
      messageStartId: chatMemoryStrikes.messageStartId,
      messageEndId: chatMemoryStrikes.messageEndId,
      contentHash: chatMemoryStrikes.contentHash,
      topicAnchor: chatMemoryStrikes.topicAnchor,
    })
    .from(chatMemoryStrikes)
    .where(
      and(
        eq(chatMemoryStrikes.chatId, chatId),
        bucket,
        eq(chatMemoryStrikes.tier, strike.tier),
        eq(chatMemoryStrikes.messageStartId, strike.messageStartId),
        eq(chatMemoryStrikes.messageEndId, strike.messageEndId),
      ),
    )
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** Delete one strike of this room. Returns true when a row moved. */
export async function deleteMemoryStrike(db: Db, chatId: ChatId, strikeId: ChatMemoryStrikeId): Promise<boolean> {
  const dropped = await db
    .delete(chatMemoryStrikes)
    .where(and(eq(chatMemoryStrikes.id, strikeId), eq(chatMemoryStrikes.chatId, chatId)))
    .returning({ id: chatMemoryStrikes.id });
  return dropped.length > 0;
}

/** The host-handoff re-key: a scoped strike follows its character to the nominee's copy, in the same batch that
 *  re-keys the digests, so the strike still names the item afterwards. Shared-bucket strikes store no character. */
export function restampMemoryStrikesStatement(db: Db, chatId: ChatId, sourceCharacterId: CharacterId, characterId: CharacterId): BatchStmt {
  return batchStmt(
    db
      .update(chatMemoryStrikes)
      .set({ scopedCharacterId: characterId })
      .where(and(eq(chatMemoryStrikes.chatId, chatId), eq(chatMemoryStrikes.scopedCharacterId, sourceCharacterId))),
  );
}
