// domain/rpg/verbs/journal/edit-journal-entry — editJournalEntry (docs/plans/rpg/design.md). Host-gated, game-scoped
// (an entry id from another game → leak-free NOT-FOUND, the cross-tenant IDOR belt). Reaches MODEL entries too
// (the recovery path the lineage projection makes safe).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { EditJournalEntryParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { updateJournalEntry } from "../../persistence/journal.ts";

export function createEditJournalEntry(ctx: RpgContext): Pick<RpgService, "editJournalEntry"> {
  async function editJournalEntry(params: EditJournalEntryParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    if (!(await updateJournalEntry(ctx.db, game.id, params.entryId, params.patch))) {
      throw new DomainNotFoundError("journal", params.entryId);
    }
    // The paged Journal refetches (§4.9).
    ctx.emitBus({ type: "journalChanged", chatId: params.chatId, journalId: params.entryId });
  }
  return { editJournalEntry };
}
