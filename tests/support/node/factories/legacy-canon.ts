// Launched databases held imported canon numbered from seq 0 until migration 0005 renumbered it
// (`packages/db/src/migrations/0005_renumber-imported-canon.sql`). Suites proving the read paths still tolerate it plant it here.

import { messages } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

/** Shift a room's canon so its oldest slot sits at seq 0, the shape the earlier import writer left behind. */
export async function plantLegacyZeroCanon(root: ServerProducerRoot, chatId: ChatId): Promise<void> {
  const shifted = await root.db
    .update(messages)
    .set({ seq: sql`${messages.seq} - (SELECT min(${messages.seq}) FROM ${messages} WHERE ${messages.chatId} = ${chatId})` })
    .where(eq(messages.chatId, chatId))
    .returning({ id: messages.id });
  if (shifted.length === 0) {
    throw new Error("the room has no canon to re-number");
  }
}
