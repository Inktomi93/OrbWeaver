import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { and, asc, desc, eq, gte, lte, max } from "drizzle-orm";
import type { MessageWindowAnchor } from "../contract/views.ts";

/** An anchor lookup always includes the room and the viewer's already-resolved history floor. */
export async function loadWindowAnchor(db: Db, chatId: ChatId, messageId: MessageId, floorSeq: HistoryFloorSeq): Promise<MessageWindowAnchor | null> {
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
  { seqStart, seqEnd, floorSeq }: { readonly seqStart: number; readonly seqEnd: number; readonly floorSeq: HistoryFloorSeq },
): Promise<{
  readonly first: MessageWindowAnchor | null;
  readonly last: MessageWindowAnchor | null;
}> {
  const where = and(eq(messages.chatId, chatId), gte(messages.seq, Math.max(seqStart, floorSeq)), lte(messages.seq, seqEnd));
  const [first, last] = await Promise.all([
    db.select({ id: messages.id, seq: messages.seq }).from(messages).where(where).orderBy(asc(messages.seq)).limit(1),
    db.select({ id: messages.id, seq: messages.seq }).from(messages).where(where).orderBy(desc(messages.seq)).limit(1),
  ]);
  return { first: first[0] ?? null, last: last[0] ?? null };
}

/** Is the newest visible message a user line, i.e. does a reply generated now answer it? A hidden message is off
 *  the wire, so it is skipped. `false` for an empty chat or an assistant tail. */
export async function loadTailIsUserMessage(db: Db, chatId: ChatId): Promise<boolean> {
  const tailRows = await db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.excludedFromPrompt, false)));
  const tailSeq = tailRows.at(0)?.seq ?? null;
  if (tailSeq === null) {
    return false;
  }
  const userRows = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user"), eq(messages.seq, tailSeq)))
    .limit(1);
  return userRows.length > 0;
}
