// domain/rpg/verbs/read/list-journal — listJournal (rpg-design/05 §4.8). The paged, lineage-projected journal
// archive (a swipe changes the page's contents with zero writes — §2.5). Member-gated.

import type { RpgJournalEntryView } from "@orb/contracts/rpg";
import type { ListJournalParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { listActiveJournal } from "../../persistence/journal.ts";

const DEFAULT_JOURNAL_LIMIT = 50;

export function createListJournal(ctx: RpgContext): Pick<RpgService, "listJournal"> {
  async function listJournal(params: ListJournalParams): Promise<readonly RpgJournalEntryView[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const rows = await listActiveJournal(ctx.db, game.id, { limit: params.limit ?? DEFAULT_JOURNAL_LIMIT, offset: params.offset ?? 0 });
    return rows.map((r) => ({ id: r.id, type: r.type, label: r.label, title: r.title, content: r.content, createdAt: r.createdAt }));
  }
  return { listJournal };
}
