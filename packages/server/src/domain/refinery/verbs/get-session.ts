// verb: getSession — the full session view (the CONTENT surface's state). Ownership derives through the
// character join (D23); foreign and absent collapse to NOT_FOUND.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";

export function createGetSession(ctx: RefineryContext): RefineryService["getSession"] {
  return async ({ principal, sessionId }) => {
    const row = await loadOwnedSessionRow(ctx.db, principal.userId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    return sessionViewOf(row);
  };
}
