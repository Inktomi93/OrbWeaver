// verb: rename — mutable display metadata only. UPDATE … WHERE id=? AND owner_id=? RETURNING folds the
// ownership check + the write into one round-trip; an empty result = not owned / not found → typed NotFound.
// Bumps `updatedAt` (a visible write timestamp), touches NOTHING derived (chunks/attachments unaffected).

import { documents } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { DocumentNotFoundError } from "../contract/errors.ts";
import type { RenameDocumentParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import type { DocumentView } from "../contract/views.ts";
import { toDocumentView } from "../persistence/queries.ts";
import { activeSpaceModel } from "../substrate/active-space.ts";

export function createRename(ctx: DatabankContext): DatabankService["rename"] {
  return async ({ principal, id, name }: RenameDocumentParams): Promise<DocumentView> => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const updated = await ctx.db
      .update(documents)
      .set({ name, updatedAt: at })
      .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
      .returning();
    const row = updated[0];
    if (row === undefined) {
      throw new DocumentNotFoundError(id);
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.rename", entityType: "document", entityId: id, metadata: { name } }, at);
    // Announced after the RETURNING proved the row was the caller's and was written; a not-owned/not-found
    // rename threw above, so a refused write announces nothing (survey H3).
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId: id });
    const counts = await ctx.countChunks({ documentIds: [id], model: await activeSpaceModel(ctx, ownerId) });
    return toDocumentView(
      {
        id: row.id,
        name: row.name,
        mime: row.mime,
        origin: row.origin,
        sourceUrl: row.sourceUrl,
        byteSize: row.byteSize,
        charCount: row.extractedText.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      counts.get(id) ?? 0,
    );
  };
}
