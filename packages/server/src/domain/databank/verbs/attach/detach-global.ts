// verb: detachGlobal — clear a document's global scope. Idempotent: a detach of a non-attached pair is a
// no-op void (the panel toggles freely; conflict errors on a toggle are UX noise with no integrity value).

import { globalDocuments } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { GlobalAttachParams } from "../../contract/params";
import type { DatabankContext, DatabankService } from "../../contract/service";

export function createDetachGlobal(ctx: DatabankContext): DatabankService["detachGlobal"] {
  return async ({ principal, documentId }: GlobalAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    const deleted = await ctx.db
      .delete(globalDocuments)
      .where(and(eq(globalDocuments.ownerId, ownerId), eq(globalDocuments.documentId, documentId)))
      .returning({ documentId: globalDocuments.documentId });
    if (deleted.length === 0) {
      return; // not attached — idempotent no-op
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.detachGlobal", entityType: "document", entityId: documentId }, ctx.now());
  };
}
