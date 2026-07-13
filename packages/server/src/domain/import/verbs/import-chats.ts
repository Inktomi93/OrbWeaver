// verb: importChats FLAG[PD-77] — attaches loose ST chat `.jsonl` files to an EXISTING owned character
// (chosen explicitly; ST chat headers don't reliably carry the character name). Translates each parsed
// chat to `BulkImportChatInput` and delegates the write to the injected `bulkImportChats` op.

import type { ImportContext } from "../context";
import type { ImportChatsResult } from "../contract/results";
import type { ImportService } from "../contract/service";
import type { ImportChatsInput } from "../contract/views";
import { requireProfile } from "../guard";
import { buildBulkImportChatInput } from "../substrate/chat-input";

export function createImportChats(ctx: ImportContext): ImportService["importChats"] {
  return async (input: ImportChatsInput): Promise<ImportChatsResult> => {
    const profile = requireProfile(ctx);
    const ownerId = ctx.ownerId;

    const chats = input.chats.map((c) =>
      buildBulkImportChatInput(c, {
        now: profile.now,
        personaByUserName: profile.personaByUserName,
      }),
    );
    const counts = await profile.bulkImportChats({
      ownerId,
      characterId: input.characterId,
      chats,
    });

    // FLAG[PD-78]: a chat canon-write always enqueues the downstream index sweep.
    if (counts.realConversationWritten) {
      await profile.enqueueBackfill({ ownerId });
    }

    return {
      characterId: input.characterId,
      chatsImported: counts.chatsImported,
      chatsSkipped: counts.chatsSkipped,
      messagesImported: counts.messagesImported,
      variantsImported: counts.variantsImported,
      branchesLinked: counts.branchesLinked,
      backfillEnqueued: counts.realConversationWritten,
    };
  };
}
