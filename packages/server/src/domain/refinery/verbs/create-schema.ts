// verb: createSchema — mint a custom payload-schema row (R3/SF0). The ONE belt is
// `refinerySchemaDocumentSchema` (contracts: lift + depth/pattern/hint caps + the stage's well-known
// core) — refuses typed with construct + path BEFORE anything persists; a stored schema is therefore
// LIFTABLE BY INVARIANT. S5 name hygiene via the shared substrate.

import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { insertOwnedSchemaIfNameFree, schemaSummaryOf } from "../persistence/queries.ts";
import { schemaNameTakenError } from "../substrate/schema-library.ts";

export function createCreateSchema(ctx: RefineryContext): RefineryService["createSchema"] {
  return async ({ principal, name, description, stage, schema }) => {
    const ownerId = principal.userId;
    const doc = refinerySchemaDocumentSchema.parse({ name, description, stage, schema });
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
    const inserted = await insertOwnedSchemaIfNameFree(ctx.db, row);
    if (inserted === undefined) {
      throw schemaNameTakenError(doc.name);
    }
    // No session id: the schema library is the domain's OTHER noun and the member is coarse (contracts
    // `user-bus` — the client path-invalidates the refinery root either way).
    ctx.emitUserEvent(ownerId, { type: "refineryChanged" });
    return schemaSummaryOf(inserted);
  };
}
