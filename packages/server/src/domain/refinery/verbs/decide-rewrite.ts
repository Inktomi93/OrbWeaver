// verb: decideRewrite — persist the review's Keep/Discard sheet for one rewrite run, as each block is pressed,
// so leaving and re-entering the session reopens the same decisions (and the same Apply count). The sheet
// is keyed by rewrite run: a later run starts undecided, an earlier run viewed back keeps its own sheet.

import { refineryRewriteDecisionsSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq, sql } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSessionRow, loadSessionRewriteRunRow, sessionViewOf } from "../persistence/queries.ts";

export function createDecideRewrite(ctx: RefineryContext): RefineryService["decideRewrite"] {
  return async ({ principal, sessionId, rewriteRunId, decisions }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    // A sheet can only describe a rewrite run of THIS session; anything else collapses to NOT_FOUND (leak-free).
    if ((await loadSessionRewriteRunRow(ctx.db, sessionId, rewriteRunId)) === undefined) {
      throw new DomainNotFoundError("refinery run", rewriteRunId);
    }
    const sheet = refineryRewriteDecisionsSchema.parse({ [rewriteRunId]: decisions })[rewriteRunId];
    // `json_set` on the one key, never a whole-column replace: other runs' sheets stay exactly as stored.
    await ctx.db
      .update(refinerySessions)
      .set({
        rewriteDecisions: sql`json_set(${refinerySessions.rewriteDecisions}, ${`$."${rewriteRunId}"`}, json(${JSON.stringify(sheet)}))`,
        updatedAt: ctx.now(),
      })
      .where(eq(refinerySessions.id, sessionId));
    const updated = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (updated === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    return sessionViewOf(updated);
  };
}
