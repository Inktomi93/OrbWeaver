// domain/chat/persistence/import-landing — removal of an imported room that never finished landing.
//
// An import commits a large room in stages (`import-write.ts`), so a failure or a crash between stages leaves a
// room whose `chats.landing_at` is still set. Every delete here keys on that column and nothing else: a landed room
// (`landing_at` NULL) is never touched, whatever rows it holds. The rows go in chunks, one turn of the loop apart,
// because a single cascade over a long room would hold the server as long as its commit would have.

import type { Db } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { yieldToLoop } from "#primitives/abort";

/** The most message and variant rows one landing stage commits, and one cleanup chunk deletes. A short row costs
 *  about 10 µs to write with its indexes on a quiet box and up to 45 µs on a fully loaded one, so a stage holds the
 *  loop 10 to 45 ms. A message with many short swipes weighs by its variant rows, not by its text. */
export const LANDING_STAGE_ROWS = 1000;

/** The most characters of message text one landing stage carries. A long message costs by its text, not its count:
 *  a 1000-message stage of reply-length turns (about 1 MB) held the loop 232 ms on a loaded box. */
export const LANDING_STAGE_CHARS = 131_072;

/** Delete one landing room: its variants a chunk at a time, then its messages (their assets cascade, bounded by the
 *  text a stage carries), then the room, whose claim and every other child cascade with it. A room that has landed
 *  meanwhile keeps every row. */
export async function deleteLandingChat(db: Db, chatId: ChatId): Promise<void> {
  const landingMessages = sql`SELECT ${messages.id} FROM ${messages} JOIN ${chats} ON ${chats.id} = ${messages.chatId} WHERE ${messages.chatId} = ${chatId} AND ${chats.landingAt} IS NOT NULL`;
  const chunks = [
    sql`DELETE FROM ${messageVariants} WHERE ${messageVariants.id} IN (SELECT ${messageVariants.id} FROM ${messageVariants} WHERE ${messageVariants.messageId} IN (${landingMessages}) LIMIT ${LANDING_STAGE_ROWS})`,
    sql`DELETE FROM ${messages} WHERE ${messages.id} IN (${landingMessages} LIMIT ${LANDING_STAGE_ROWS})`,
  ];
  for (const chunk of chunks) {
    let full = true;
    while (full) {
      await yieldToLoop();
      const deleted = await db.run(chunk);
      full = deleted.rowsAffected >= LANDING_STAGE_ROWS;
    }
  }
  await db.delete(chats).where(and(eq(chats.id, chatId), isNotNull(chats.landingAt)));
}

/** Delete every room a dead process left landing. Boot runs it before any worker starts, so no live import owns
 *  one of these rooms. Returns how many it removed. */
export async function sweepLandingChats(db: Db): Promise<number> {
  const landing = await db.select({ id: chats.id }).from(chats).where(isNotNull(chats.landingAt));
  for (const { id } of landing) {
    await deleteLandingChat(db, id);
  }
  return landing.length;
}
