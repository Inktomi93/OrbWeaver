// verb: remove — delete an owned document. DELETE … WHERE id=? AND owner_id=? RETURNING folds the ownership
// check + the deletion into one round-trip; an empty result = not owned / not found → typed NotFound. The DB
// does the cascade-safety: the document's `document_chunks` AND all three scope-junction rows CASCADE away.
// The CAS blob (`sourceAssetId`) is left to the assets GC (an unreferenced blob self-heals on the next sweep —
// never a synchronous reap that could fail the delete). Only a real deletion audits.

import { documents } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { DocumentNotFoundError } from "../contract/errors";
import type { RemoveDocumentParams } from "../contract/params";
import type { DatabankContext, DatabankService } from "../contract/service";

export function createRemove(ctx: DatabankContext): DatabankService["remove"] {
  return async ({ principal, id }: RemoveDocumentParams): Promise<void> => {
    const ownerId = principal.userId;
    const deleted = await ctx.db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
      .returning({ id: documents.id });
    if (deleted.length === 0) {
      throw new DocumentNotFoundError(id);
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.remove", entityType: "document", entityId: id }, ctx.now());
  };
}
