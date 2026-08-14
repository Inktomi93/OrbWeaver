// verb: deleteSchema — drop an owned schema row. Plain by construction: every PRIOR run EMBEDDED its
// schema (P1-B), so history is untouched; a session still pointing here gets a leak-free NOT_FOUND at
// its next run (the Setup tab re-points it). Nothing FKs schemas.

import { refinerySchemas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { and, eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSchemaRow } from "../persistence/queries.ts";

export function createDeleteSchema(ctx: RefineryContext): RefineryService["deleteSchema"] {
  return async ({ principal, schemaId }) => {
    const row = await loadOwnedSchemaRow(ctx.db, principal.userId, schemaId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery schema", schemaId);
    }
    // The owner rides the WHERE (owner-scoped-writes arm 1): a non-owner's delete moves 0 rows even if
    // the load-belt above ever drifted.
    await ctx.db.delete(refinerySchemas).where(and(eq(refinerySchemas.id, schemaId), eq(refinerySchemas.ownerId, principal.userId)));
    ctx.emitUserEvent(principal.userId, { type: "refineryChanged" });
  };
}
