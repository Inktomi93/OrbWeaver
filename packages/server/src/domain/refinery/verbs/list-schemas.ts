// verb: listSchemas — the owner's custom payload-schema library, newest-updated first (the stage-config
// picker + the editor's list). Directly owner-scoped (the schema table's own header — library tooling,
// not per-character work product).

import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { listOwnedSchemaRows, schemaSummaryOf } from "../persistence/queries.ts";

export function createListSchemas(ctx: RefineryContext): RefineryService["listSchemas"] {
  return async ({ principal }) => {
    const rows = await listOwnedSchemaRows(ctx.db, principal.userId);
    return rows.map(schemaSummaryOf);
  };
}
