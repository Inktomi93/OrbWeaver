// domain/rpg/verbs/journal/delete-journal-entry — deleteJournalEntry (rpg-design/05 §4.4). Host-gated,
// game-scoped (a foreign game's entry id → leak-free NOT-FOUND, the cross-tenant IDOR belt).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DeleteJournalEntryParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { deleteJournalEntry as deleteJournalEntryRow } from "../../persistence/journal";

export function createDeleteJournalEntry(ctx: RpgContext): Pick<RpgService, "deleteJournalEntry"> {
  async function deleteJournalEntry(params: DeleteJournalEntryParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    if (!(await deleteJournalEntryRow(ctx.db, game.id, params.entryId))) {
      throw new DomainNotFoundError("journal", params.entryId);
    }
    // The paged Journal refetches (§4.9).
    ctx.emitBus({ type: "journalChanged", chatId: params.chatId, journalId: params.entryId });
  }
  return { deleteJournalEntry };
}
