// verb: deleteSession — owner-belted delete; the run log CASCADEs with the session (the R0 DDL). The
// character and its canon are untouched — a session is work product, never canon.

import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSessionRow } from "../persistence/queries.ts";

export function createDeleteSession(ctx: RefineryContext): RefineryService["deleteSession"] {
  return async ({ principal, sessionId }) => {
    const row = await loadOwnedSessionRow(ctx.db, principal.userId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    await ctx.db.delete(refinerySessions).where(eq(refinerySessions.id, sessionId));
  };
}
