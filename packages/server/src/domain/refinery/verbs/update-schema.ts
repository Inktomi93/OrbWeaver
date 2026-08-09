// verb: updateSchema — patch an owned schema row. The WHOLE merged document re-runs the belt (a stage
// flip re-checks the core against the possibly-unchanged schema; a schema edit re-checks everything).
// CONTENT changes bump `version` — the pin the run log's embedded provenance records (P1-B); a
// description-only edit does not (prose is not provenance). Leak-free NOT_FOUND on foreign/absent ids.

import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { refinerySchemas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { and, eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSchemaRow, schemaSummaryOf } from "../persistence/queries.ts";
import { assertSchemaNameFree } from "../substrate/schema-library.ts";

export function createUpdateSchema(ctx: RefineryContext): RefineryService["updateSchema"] {
  return async ({ principal, schemaId, patch }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSchemaRow(ctx.db, ownerId, schemaId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery schema", schemaId);
    }
    const doc = refinerySchemaDocumentSchema.parse({
      name: patch.name ?? row.name,
      description: patch.description ?? row.description,
      stage: patch.stage ?? row.stage,
      schema: patch.schema ?? row.schema,
    });
    if (patch.name !== undefined && patch.name !== row.name) {
      await assertSchemaNameFree(ctx, ownerId, doc.name, schemaId);
    }
    const contentChanged = patch.schema !== undefined || patch.stage !== undefined || (patch.name !== undefined && patch.name !== row.name);
    const version = contentChanged ? row.version + 1 : row.version;
    const updated = {
      ...row,
      name: doc.name,
      description: doc.description,
      stage: doc.stage,
      schema: doc.schema,
      version,
      updatedAt: ctx.now(),
    };
    await ctx.db
      .update(refinerySchemas)
      .set({ name: updated.name, description: updated.description, stage: updated.stage, schema: updated.schema, version, updatedAt: updated.updatedAt })
      // The owner rides the WHERE (owner-scoped-writes arm 1).
      .where(and(eq(refinerySchemas.id, schemaId), eq(refinerySchemas.ownerId, ownerId)));
    return schemaSummaryOf(updated);
  };
}
