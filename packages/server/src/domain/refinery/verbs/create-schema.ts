// verb: createSchema — mint a custom payload-schema row (R3/SF0). The ONE belt is
// `refinerySchemaDocumentSchema` (contracts: lift + depth/pattern/hint caps + the stage's well-known
// core) — refuses typed with construct + path BEFORE anything persists; a stored schema is therefore
// LIFTABLE BY INVARIANT. S5 name hygiene via the shared substrate.

import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { refinerySchemas } from "@orb/db";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { schemaSummaryOf } from "../persistence/queries.ts";
import { assertSchemaNameFree } from "../substrate/schema-library.ts";

export function createCreateSchema(ctx: RefineryContext): RefineryService["createSchema"] {
  return async ({ principal, name, description, stage, schema }) => {
    const ownerId = principal.userId;
    const doc = refinerySchemaDocumentSchema.parse({ name, description, stage, schema });
    await assertSchemaNameFree(ctx, ownerId, doc.name);
    const at = ctx.now();
    const row = {
      id: ctx.newRefinerySchemaId(),
      ownerId,
      name: doc.name,
      description: doc.description,
      stage: doc.stage,
      schema: doc.schema,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    await ctx.db.insert(refinerySchemas).values(row);
    return schemaSummaryOf(row);
  };
}
