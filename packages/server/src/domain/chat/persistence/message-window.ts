import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

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
