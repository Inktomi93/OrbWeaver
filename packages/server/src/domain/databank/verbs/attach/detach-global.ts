// verb: detachGlobal — clear a document's global scope. Idempotent: a detach of a non-attached pair is a
// no-op void (the panel toggles freely; conflict errors on a toggle are UX noise with no integrity value).

import { globalDocuments } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { GlobalAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";

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
    // Real change only — the idempotent no-op returned above (survey H3). The room half is the same D85
    // reach as the attach twin, resolvable after the delete because its key is the ownerId (#2471).
    await ctx.fanDatabankRoomsForMember(ownerId);
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
