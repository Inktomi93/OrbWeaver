// domain/rpg/verbs/read/count-journal — countJournal. How many journal entries the caller may read, so a surface
// that pages `listJournal` can say how many exist beyond the page it shows. Member-gated, and counted under the
// same D16 history floor and lineage projection as the list: the number never claims an entry the list withholds.

import type { ReadGameParams } from "#src/domain/rpg/contract/params.ts";
import type { RpgContext, RpgService } from "#src/domain/rpg/contract/service.ts";
import { resolveMember } from "#src/domain/rpg/guard.ts";
import { countActiveJournal } from "#src/domain/rpg/persistence/journal.ts";

export function createCountJournal(ctx: RpgContext): Pick<RpgService, "countJournal"> {
  async function countJournal(params: ReadGameParams): Promise<number> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const visibility = await ctx.resolveViewerVisibility(params.chatId, params.principal.userId);
    return await countActiveJournal(ctx.db, game.id, { historyFloorSeq: visibility?.historyFloorSeq ?? null });
  }
  return { countJournal };
}
