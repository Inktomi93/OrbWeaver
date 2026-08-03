// domain/rpg/verbs/journal/add-journal-entry — addJournalEntry (rpg-design/05 §4.4). A hand journal entry:
// stamps `variantId: NULL` (every-lineage room truth, §2.5) with no `sourceMessageId`. Host-gated. The MODEL
// arm (staged → flushed stamped with the committed variant) is the turn-flush path, W1b-integration.

import type { RpgJournalId } from "@orb/kit/ids";
import type { AddJournalEntryParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { insertJournalEntry } from "../../persistence/journal.ts";

export function createAddJournalEntry(ctx: RpgContext): Pick<RpgService, "addJournalEntry"> {
  async function addJournalEntry(params: AddJournalEntryParams): Promise<RpgJournalId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const id = ctx.ids.journal();
    await insertJournalEntry(ctx.db, {
      id,
      gameId: game.id,
      type: params.type,
      // R4c — the free gloss is meaningful ONLY on a `custom` type (the relationship-kind precedent).
      label: params.type === "custom" ? (params.label ?? "") : "",
      title: params.title,
      content: params.content,
      variantId: null, // hand entry — every lineage
      sourceMessageId: null,
      createdAt: ctx.now(),
    });
    // The paged Journal refetches (§4.9). `journalId` is the new entry's id (a targeting hint).
    ctx.emitBus({ type: "journalChanged", chatId: params.chatId, journalId: id });
    return id;
  }
  return { addJournalEntry };
}
