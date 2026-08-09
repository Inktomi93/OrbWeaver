// verb: listSessions — the owner's roster (D62 LIST: name · character · verdict badge · updatedAt),
// newest-updated first, `latestVerdict` = the newest analyze run's verdict per session (null before the
// first analyze). Owner-scoped through the character join in the persistence read — the SAME join that
// now carries the row's character name + avatar hash, so the roster names its cards without the client
// paging `character.list` to find them (`refinerySessionSummarySchema`'s ceiling note).

import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestVerdictsOf, listOwnedSessionRows, sessionSummaryOf } from "../persistence/queries.ts";

export function createListSessions(ctx: RefineryContext): RefineryService["listSessions"] {
  return async ({ principal }) => {
    const rows = await listOwnedSessionRows(ctx.db, principal.userId);
    const verdicts = await latestVerdictsOf(
      ctx.db,
      rows.map((r) => r.session.id),
    );
    return rows.map((row) => sessionSummaryOf(row, verdicts.get(row.session.id) ?? null));
  };
}
