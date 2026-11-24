// domain/rpg/verbs/journal/edit-journal-entry — editJournalEntry (D58). Host-gated, game-scoped
// (an entry id from another game → leak-free NOT-FOUND, the cross-tenant IDOR belt). Reaches MODEL entries too
// (the recovery path the lineage projection makes safe).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { EditJournalEntryParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveHost } from "#src/domain/rpg/guard.ts";
import { updateJournalEntry } from "#src/domain/rpg/persistence/journal.ts";

export function createEditJournalEntry(ctx: RpgContext): Pick<RpgService, "editJournalEntry"> {
  async function editJournalEntry(params: EditJournalEntryParams): Promise<void> {
    const { game, admission } = await resolveHost(ctx, params.principal, params.chatId);
    const claim = await ctx.claimChat(admission);
    if (!(await updateJournalEntry(ctx.db, claim, { gameId: game.id, id: params.entryId }, params.patch))) {
      throw new DomainNotFoundError({ kind: "rpg_journal", id: params.entryId });
    }
    // The paged Journal refetches (§4.9).
    ctx.emitBus({ type: "journalChanged", chatId: params.chatId, journalId: params.entryId });
  }
  return { editJournalEntry };
}
