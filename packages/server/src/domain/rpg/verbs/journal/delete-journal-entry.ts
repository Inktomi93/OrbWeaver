// domain/rpg/verbs/journal/delete-journal-entry — deleteJournalEntry (docs/plans/rpg/design.md). Host-gated,
// game-scoped (a foreign game's entry id → leak-free NOT-FOUND, the cross-tenant IDOR belt).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DeleteJournalEntryParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { deleteJournalEntry as deleteJournalEntryRow } from "#src/domain/rpg/persistence/journal.ts";

export function createDeleteJournalEntry(ctx: RpgContext): Pick<RpgService, "deleteJournalEntry"> {
  async function deleteJournalEntry(params: DeleteJournalEntryParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    await ctx.claimChat(params.chatId);
    if (!(await deleteJournalEntryRow(ctx.db, game.id, params.entryId))) {
      throw new DomainNotFoundError("journal", params.entryId);
    }
    // The paged Journal refetches (§4.9).
    ctx.emitBus({ type: "journalChanged", chatId: params.chatId, journalId: params.entryId });
  }
  return { deleteJournalEntry };
}
