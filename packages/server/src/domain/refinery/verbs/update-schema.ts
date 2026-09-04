// verb: updateSchema — patch an owned schema row. The WHOLE merged document re-runs the belt (a stage
// flip re-checks the core against the possibly-unchanged schema; a schema edit re-checks everything).
// CONTENT changes bump `version` — the pin the run log's embedded provenance records (P1-B); a
// description-only edit does not (prose is not provenance). Leak-free NOT_FOUND on foreign/absent ids.

import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import type { refinerySchemas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefinerySchemaId, UserId } from "@orb/kit/ids";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSchemaRow, schemaSummaryOf, updateOwnedSchemaIfNameFree } from "../persistence/queries.ts";
import { schemaNameTakenError, schemaStalePatchError } from "../substrate/schema-library.ts";

/** Three refusals share ONE empty result, so an owner-scoped re-read says which — in the order the user can
 *  act on: gone, then moved-under-us (stale: their patch is intact and they re-apply it), then name-taken.
 *  Reached only on the empty-result path, so the CAS costs the happy path no query. */
async function refusalFor(
  ctx: RefineryContext,
  args: { readonly ownerId: UserId; readonly schemaId: RefinerySchemaId; readonly observed: RefinerySchemaRow; readonly name: string },
): Promise<Error> {
  const { ownerId, schemaId, observed, name } = args;
  const stillOwned = await loadOwnedSchemaRow(ctx.db, ownerId, schemaId);
  if (stillOwned === undefined) {
    return new DomainNotFoundError("refinery schema", schemaId);
  }
  if (stillOwned.version !== observed.version || stillOwned.description !== observed.description) {
    return schemaStalePatchError();
  }
  return schemaNameTakenError(name);
}

type RefinerySchemaRow = typeof refinerySchemas.$inferSelect;

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
    // OPTIMISTIC CAS (#1445). The merge above is a READ-MODIFY-WRITE of the WHOLE document, so the write
    // must be conditional on the row still being `row` — two concurrent patches to DISJOINT fields both
    // merge off the same pre-edit snapshot, and without the predicate the second one silently drops the
    // first (both answering success, both reporting the same version). `row` is what this caller OBSERVED;
    // `updated` is what it would write.
    const persisted = await updateOwnedSchemaIfNameFree(ctx.db, updated, row);
    if (persisted === undefined) {
      throw await refusalFor(ctx, { ownerId, schemaId, observed: row, name: doc.name });
    }
    ctx.emitUserEvent(ownerId, { type: "refineryChanged" });
    return schemaSummaryOf(persisted);
  };
}
