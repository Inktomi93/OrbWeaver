// A message's position is derived at read, per viewer, and never stored: a stored number needs renumbering on every
// delete and move, and a room-wide value that reached a floored viewer would disclose how many rows sit under their floor.
import type { HistoryFloorSeq, MessageView } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";

/** Numbers a chronological canon page from the rows before it. A page is one unbroken run of the viewer's rows, so a
 *  single count over the `messages_chat_seq_unique` index prices the whole page. */
export async function positionCanonPage(db: Db, chatId: ChatId, floorSeq: HistoryFloorSeq, page: readonly MessageView[]): Promise<readonly MessageView[]> {
  const first = page[0];
  if (first === undefined) {
    return page;
  }
  const [earlier] = await db
    .select({ rows: count() })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, floorSeq), lt(messages.seq, first.seq)));
  const before = earlier?.rows ?? 0;
  return page.map((view, index) => ({ ...view, position: before + index + 1 }));
}

/** The current position of each named row the viewer can read. A row under the floor or already deleted has no entry. */
export async function loadMessagePositions(
  db: Db,
  chatId: ChatId,
  floorSeq: HistoryFloorSeq,
  messageIds: readonly MessageId[],
): Promise<ReadonlyMap<MessageId, number>> {
  if (messageIds.length === 0) {
    return new Map<MessageId, number>();
  }
  const visible = db
    .select({ id: messages.id, position: sql<number>`row_number() over (order by ${messages.seq})`.as("position") })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, floorSeq)))
    .as("visible");
  // A replay can name more rows than SQLite takes bind parameters, so the ids travel as one JSON value.
  const rows = await db
    .select({ id: sql<MessageId>`${visible.id}`, position: visible.position })
    .from(visible)
    .where(sql`${visible.id} in (select value from json_each(${JSON.stringify(messageIds)}))`);
  return new Map(rows.map(({ id, position }) => [id, position]));
}
