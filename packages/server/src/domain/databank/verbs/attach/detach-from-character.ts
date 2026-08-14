// verb: detachFromCharacter — clear a document's character scope (DB8). Gates character ownership
// (`ensureCharacterOwned`) BEFORE the delete: the junction row is keyed on `characterId` alone (not the
// caller's ownerId), so an ungated delete could reach a FOREIGN character's row — the ownership gate is the
// cross-tenant chokepoint (world-info detach precedent). Idempotent: a detach of a non-attached pair is a
// no-op void (the panel toggles freely).

import { characterDocuments } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { CharacterAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { ensureCharacterOwned } from "../../persistence/queries.ts";

export function createDetachFromCharacter(ctx: DatabankContext): DatabankService["detachFromCharacter"] {
  return async ({ principal, documentId, characterId }: CharacterAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    const deleted = await ctx.db
      .delete(characterDocuments)
      .where(and(eq(characterDocuments.characterId, characterId), eq(characterDocuments.documentId, documentId)))
      .returning({ documentId: characterDocuments.documentId });
    if (deleted.length === 0) {
      return; // not attached — idempotent
    }
    await ctx.audit(
      { actorUserId: ownerId, action: "databank.detachFromCharacter", entityType: "document", entityId: documentId, metadata: { characterId } },
      ctx.now(),
    );
    // Owner-scoped on both sides — real detach only (see `attach-to-character`).
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
