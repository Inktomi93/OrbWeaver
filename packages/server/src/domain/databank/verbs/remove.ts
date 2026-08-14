// verb: remove — delete an owned document. DELETE … WHERE id=? AND owner_id=? RETURNING folds the ownership
// check + the deletion into one round-trip; an empty result = not owned / not found → typed NotFound. The DB
// does the cascade-safety: the document's `document_chunks` AND all three scope-junction rows CASCADE away.
// The CAS blob (`sourceAssetId`) is left to the assets GC (an unreferenced blob self-heals on the next sweep —
// never a synchronous reap that could fail the delete). Only a real deletion audits.

import { documents } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { DocumentNotFoundError } from "../contract/errors.ts";
import type { RemoveDocumentParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";

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
    // Announced AFTER the row (and its cascaded chunks + junctions) are gone — the delete-emits-after-commit
    // rule: there is no durable event row here to orphan, and the subscriber's re-read discipline is id-only,
    // so it re-reads the list and finds the document absent. D50 bans a per-entity DELETION member; this is
    // the same coarse `databankChanged` every other write sends, carrying the departed id as a hint.
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId: id });
  };
}
