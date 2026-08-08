// verb: listSessions — the owner's roster (D62 LIST: name · character · verdict badge · updatedAt),
// newest-updated first, `latestVerdict` = the newest analyze run's verdict per session (null before the
// first analyze). Owner-scoped through the character join in the persistence read.

import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestVerdictsOf, listOwnedSessionRows, sessionSummaryOf } from "../persistence/queries.ts";

export function createListSessions(ctx: RefineryContext): RefineryService["listSessions"] {
  return async ({ principal }) => {
    const rows = await listOwnedSessionRows(ctx.db, principal.userId);
    const verdicts = await latestVerdictsOf(
      ctx.db,
      rows.map((r) => r.id),
    );
    return rows.map((row) => sessionSummaryOf(row, verdicts.get(row.id) ?? null));
  };
}
