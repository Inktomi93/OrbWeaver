// domain/chat/persistence/import-landing — removal of an imported room that never finished landing.
//
// An import commits a large room in stages (`import-write.ts`), so a failure or a crash between stages leaves a
// room whose `chats.landing_at` is still set. Both deletes here key on that column and nothing else: a landed room
// (`landing_at` NULL) is never touched, whatever rows it holds. The messages go in chunks, one turn of the loop
// apart, because a single cascade over a long room would hold the server as long as its commit would have.

import type { Db } from "@orb/db";
import { chats, messages } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { yieldToLoop } from "#primitives/abort";

/** Messages one landing stage commits, and one cleanup chunk deletes. A message costs SQLite about 20 µs to write
 *  with its variant and indexes on a file database, so a stage holds the loop about 40 ms. */
export const LANDING_STAGE_MESSAGES = 2000;

/** Delete one landing room: its messages a chunk at a time (variants, assets and the rest cascade from each
 *  message), then the room, whose claim and every other child cascade with it. A room that has landed meanwhile
 *  keeps every row. */
export async function deleteLandingChat(db: Db, chatId: ChatId): Promise<void> {
  for (;;) {
    await yieldToLoop();
    const deleted = await db.run(
      sql`DELETE FROM ${messages} WHERE ${messages.id} IN (SELECT ${messages.id} FROM ${messages} JOIN ${chats} ON ${chats.id} = ${messages.chatId} WHERE ${messages.chatId} = ${chatId} AND ${chats.landingAt} IS NOT NULL LIMIT ${LANDING_STAGE_MESSAGES})`,
    );
    if (deleted.rowsAffected < LANDING_STAGE_MESSAGES) {
      break;
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
