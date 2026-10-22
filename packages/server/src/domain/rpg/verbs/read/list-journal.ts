// domain/rpg/verbs/read/list-journal — listJournal (docs/plans/rpg/design.md). The paged, lineage-projected journal
// archive (a swipe changes the page's contents with zero writes — §2.5). Member-gated.
//
// TWO VISIBILITY BELTS, both off chat's ONE `resolveViewerVisibility` verdict (#1528):
//
//  • THE D16 HISTORY FLOOR. The journal is the rpg plane that keeps PER-TURN rows: a model entry stamps the
//    slot it was distilled from (`sourceMessageId`), so a `from-join` member reading it unfloored reads a
//    summary of canon their own `listMessages` withholds — the same bytes, one distillation removed. The floor
//    is applied IN THE QUERY (not by filtering a page after the fact, which would silently short-page the
//    member) and the number is MINTED ONLY by chat's clamp resolver: rpg must never compute a second floor.
//    A HAND entry (`sourceMessageId IS NULL`) has no canon anchor and rides through — the same rule the chat
//    event clamp states for an anchorless event, and the honest one: a host's room note is not a pre-join turn.
//  • THE HIDDEN-SPAN STRIP. A `<lie>`'s truth is the host's plane (§3.6) wherever it sits, and an extraction
//    quotes model prose straight into `title`/`content`. The host reads verbatim (the reveal eye); every other
//    present role reads the stripped bytes, through the same walk the member→host fork runs.

import type { RpgJournalEntryView } from "@orb/contracts/rpg";
import type { ListJournalParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveMember } from "#src/domain/rpg/guard.ts";
import { listActiveJournal } from "#src/domain/rpg/persistence/journal.ts";
import { stripHiddenForViewer } from "#src/domain/rpg/substrate/hidden-spans.ts";

const DEFAULT_JOURNAL_LIMIT = 50;

export function createListJournal(ctx: RpgContext): Pick<RpgService, "listJournal"> {
  async function listJournal(params: ListJournalParams): Promise<readonly RpgJournalEntryView[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const visibility = await ctx.resolveViewerVisibility(params.chatId, params.principal.userId);
    const rows = await listActiveJournal(ctx.db, game.id, {
      limit: params.limit ?? DEFAULT_JOURNAL_LIMIT,
      offset: params.offset ?? 0,
      historyFloorSeq: visibility?.historyFloorSeq ?? null,
    });
    const views = rows.map((r) => ({ id: r.id, type: r.type, label: r.label, title: r.title, content: r.content, createdAt: r.createdAt }));
    return stripHiddenForViewer(views, visibility?.readsHidden ?? false);
  }
  return { listJournal };
}
