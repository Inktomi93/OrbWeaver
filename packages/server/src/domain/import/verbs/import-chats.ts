// verb: importChats (PD-77) — attach a list of loose ST chat `.jsonl` files to an EXISTING owned character
// (chosen explicitly — ST chat headers don't reliably carry the character name, so there's no safe auto-
// match). Option B: `import` performs NO db access — it translates each parsed ST chat → the canonical
// `BulkImportChatInput` (`substrate/chat-input.ts`) and delegates the WRITE to the injected chat-owned
// `bulkImportChats` op, then enqueues ONE `memory-backfill` when any `real_conversation` chat was written
// (the PD-78 gate: no canon-write path leaves the downstream index un-run).
//
// The ownership gate is the chat op's precondition — a missing / non-owned character throws the shared
// `DomainNotFoundError` (`@orb/kit/errors`) from inside the op; `import` re-declares it in the verb contract.

import type { ImportChatsResult } from "../contract/results";
import type { ImportContext, ImportService } from "../contract/service";
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

    // PD-78: ONE memory-backfill per run, ONLY when a real_conversation chat was written (the gate invariant
    // — a chat canon-write always enqueues the downstream index sweep). Reuses `character.updated` semantics
    // via the workload; no `import.completed` event.
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
