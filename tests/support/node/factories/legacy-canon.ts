// Launched databases held imported canon numbered from seq 0 until migration 0005 renumbered it
// (`packages/db/src/migrations/0005_renumber-imported-canon.sql`). Suites proving the read paths still tolerate it plant it here.

import { messages } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { asc, eq, sql } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

/** Shift a room's canon so its oldest slot sits at seq 0, the shape the earlier import writer left behind. */
export async function plantLegacyZeroCanon(root: ServerProducerRoot, chatId: ChatId): Promise<void> {
  const oldest = await root.db.select({ seq: messages.seq }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq)).get();
  if (oldest === undefined) {
    throw new Error("the room has no canon to re-number");
  }
  await root.db
    .update(messages)
    .set({ seq: sql`${messages.seq} - ${oldest.seq}` })
    .where(eq(messages.chatId, chatId));
}
