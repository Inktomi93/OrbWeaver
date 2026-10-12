import type { Db } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { seedChat, seedMessage } from "../_support.ts";

export { insertCheckpoint, listCheckpoints } from "#server/domain/rpg/persistence/checkpoints.ts";
export { findGameByChat, insertGame, updateGame } from "#server/domain/rpg/persistence/games.ts";
export { insertJournalEntry, listAllJournal } from "#server/domain/rpg/persistence/journal.ts";
export { listSheets, upsertSheet } from "#server/domain/rpg/persistence/sheets.ts";
export { insertSnapshot, listSnapshots, resolveSnapshotForTurn, writeHandSnapshot } from "#server/domain/rpg/persistence/snapshots.ts";

/** Seed the FORK's copied chat + one assistant slot (the target of the remap). Returns the fork's id maps
 *  (source id → fork id) that `forkGame` re-keys through. */
export async function seedForkTarget(
  db: Db,
  key: string,
  src: { messageId: MessageId; variantId: MessageVariantId },
): Promise<{ forkChatId: ChatId; slotIdMap: Map<MessageId, MessageId>; variantIdMap: Map<MessageVariantId, MessageVariantId> }> {
  const forkChatId = await seedChat(db, `fork_${key}`);
  const { messageId: forkMsg, variantId: forkVar } = await seedMessage(db, forkChatId, 1, { role: "assistant", content: "beat one (fork)" });
  return {
    forkChatId,
    slotIdMap: new Map<MessageId, MessageId>([[src.messageId, forkMsg]]),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>([[src.variantId, forkVar]]),
  };
}
