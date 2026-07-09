// verb: removeBook — delete an owned book. DELETE … WHERE id=? AND owner_id=? RETURNING folds the ownership
// check + the deletion into one round-trip; an empty result = not owned / not found → typed NotFound. The DB
// does the cascade-safety: the book's `world_entries` AND all four scope-junction rows CASCADE away. Only a
// real deletion audits.

import { worldBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { RemoveBookParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";

export function createRemove(ctx: WorldInfoContext): WorldInfoService["removeBook"] {
  return async ({ principal, bookId }: RemoveBookParams) => {
    const ownerId = principal.userId;
    const deleted = await ctx.db
      .delete(worldBooks)
      .where(and(eq(worldBooks.id, bookId), eq(worldBooks.ownerId, ownerId)))
      .returning({ id: worldBooks.id });
    if (deleted.length === 0) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.removeBook",
        entityType: "world_book",
        entityId: bookId,
      },
      ctx.now(),
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return { deleted: true };
  };
}
