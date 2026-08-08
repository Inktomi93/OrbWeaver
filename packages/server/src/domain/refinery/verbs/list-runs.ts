// verb: listRuns — the session's append-only run ledger, oldest first (the D62 CONTEXT Runs tab). The
// ownership belt resolves the SESSION first; run rows are reachable only through it (a run id alone
// never resolves a payload — security pass §3.E). A stored row whose payload no longer parses is
// DROPPED from the view observably (the persistence read-seam heal), never fabricated.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { listRunRowsOf, loadOwnedSessionRow, runViewOf } from "../persistence/queries.ts";

export function createListRuns(ctx: RefineryContext): RefineryService["listRuns"] {
  return async ({ principal, sessionId }) => {
    const row = await loadOwnedSessionRow(ctx.db, principal.userId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    const runs = await listRunRowsOf(ctx.db, sessionId);
    return runs.map(runViewOf).filter((r) => r !== null);
  };
}
