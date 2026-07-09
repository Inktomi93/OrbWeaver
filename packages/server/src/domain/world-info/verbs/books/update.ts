// verb: updateBook — patch an owned book (whitelisted fields; `undefined` skips). The whitelist is
// load-bearing: an internal caller could otherwise smuggle identity columns (id/ownerId/createdAt) past the
// structural type — `stripUndefined` over an EXPLICIT field list closes that. UPDATE … WHERE id=? AND
// owner_id=? RETURNING folds the ownership check into the mutation; a no-op edit skips the write and re-reads.
// (`world_books` has no `updatedAt` column — nothing to bump.)

import { worldBooks } from "@orb/db";
import { stripUndefined } from "@orb/kit/objects";
import { and, eq } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { UpdateBookParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { loadOwnedBook, toBookView } from "../../persistence/queries";

export function createUpdate(ctx: WorldInfoContext): WorldInfoService["updateBook"] {
  return async ({ principal, bookId, input }: UpdateBookParams) => {
    const ownerId = principal.userId;
    const edits = stripUndefined({ name: input.name, description: input.description });

    if (Object.keys(edits).length === 0) {
      const row = await loadOwnedBook(ctx.db, ownerId, bookId);
      if (row === undefined) {
        throw new WorldInfoNotFoundError("world_book", bookId);
      }
      return toBookView(row);
    }

    const at = ctx.now();
    const rows = await ctx.db
      .update(worldBooks)
      .set(edits)
      .where(and(eq(worldBooks.id, bookId), eq(worldBooks.ownerId, ownerId)))
      .returning();
    const updated = rows[0];
    if (updated === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.updateBook",
        entityType: "world_book",
        entityId: bookId,
        metadata: { fields: Object.keys(edits) },
      },
      at,
    );

    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return toBookView(updated);
  };
}
