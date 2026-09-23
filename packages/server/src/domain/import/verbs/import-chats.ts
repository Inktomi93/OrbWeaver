// verb: importChats — attaches loose ST chat `.jsonl` files to an EXISTING owned character
// (chosen explicitly; ST chat headers don't reliably carry the character name). Translates each parsed
// chat to `BulkImportChatInput` and delegates the write to the injected `bulkImportChats` op.

import type { ImportContext } from "../context.ts";
import type { ImportChatsResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { ImportChatsInput } from "../contract/views.ts";
import { requireProfile } from "../guard.ts";
import { buildBulkImportChatInput, disambiguateChatTitles, unresolvedPinnedPersonas } from "../substrate/chat-input.ts";

export function createImportChats(ctx: ImportContext): ImportService["importChats"] {
  return async (input: ImportChatsInput): Promise<ImportChatsResult> => {
    const profile = requireProfile(ctx);
    const ownerId = ctx.ownerId;

    // Titles disambiguate across the WHOLE run, not per file: this verb receives one character's entire chat
    // set, which is exactly the population that collides (N transcripts, one cast, one day).
    const chats = disambiguateChatTitles(
      input.chats.map((c) =>
        buildBulkImportChatInput(c, {
          now: profile.now,
          personaByUserName: profile.personaByUserName,
          ...(profile.stWallClockZone === undefined ? {} : { wallClockZone: profile.stWallClockZone }),
        }),
      ),
    );
    const counts = await profile.bulkImportChats({
      ownerId,
      characterId: input.characterId,
      chats,
    });

    // (wired): a chat canon-write always OFFERS the downstream index sweep — the workloads door decides
    // whether it is admissible (#156: memory off ⇒ refused, and the report says so rather than claiming a run).
    const backfillEnqueued = counts.realConversationWritten && (await profile.enqueueBackfill({ ownerId }));

    return {
      characterId: input.characterId,
      chatsImported: counts.chatsImported,
      chatsSkipped: counts.chatsSkipped,
      messagesImported: counts.messagesImported,
      variantsImported: counts.variantsImported,
      branchesLinked: counts.branchesLinked,
      backfillEnqueued,
      chatsPersonaHealed: counts.chatsPersonaHealed,
      // §5.7: the chat-bound persona picks that named nothing on this install. Computed over the SAME batch
      // the mapper consumed, so the report can never disagree with what was written.
      unresolvedPinnedPersonas: unresolvedPinnedPersonas(input.chats, profile.personaByUserName),
    };
  };
}
