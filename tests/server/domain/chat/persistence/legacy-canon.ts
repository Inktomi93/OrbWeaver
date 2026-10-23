// Launched databases hold imported canon numbered from seq 0, a shape no current writer produces. This is the one
// home that plants it, so composed suites outside the persistence tier reach that historic state without a row write.
import { messages } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { importedSeqs } from "../scenario-physical.ts";

/** Re-number a room's canon to start at seq 0, the shape the earlier import writer left in launched databases. */
export async function renumberFromZero(h: ChatRoot, chatId: ChatId): Promise<void> {
  const [oldest] = await importedSeqs(h, chatId);
  if (oldest === undefined) {
    throw new Error("the room has no canon to re-number");
  }
  await h.root.db
    .update(messages)
    .set({ seq: sql`${messages.seq} - ${oldest}` })
    .where(eq(messages.chatId, chatId));
}
