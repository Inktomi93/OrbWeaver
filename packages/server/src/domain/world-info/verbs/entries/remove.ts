// verb: removeEntry — delete an entry, owner-scoped via the owned-book `inArray` subquery (invariant #4 —
// never a bare `eq(id)`). DELETE … WHERE id=? AND worldBookId IN (caller's books) RETURNING folds the gate +
// the deletion into one round-trip; an empty result = not owned / not found → typed NotFound.

import { worldBooks, worldEntries } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { RemoveEntryParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";

export function createRemove(ctx: WorldInfoContext): WorldInfoService["removeEntry"] {
  return async ({ principal, entryId }: RemoveEntryParams) => {
    const ownerId = principal.userId;
    const ownedBooks = ctx.db
      .select({ id: worldBooks.id })
      .from(worldBooks)
      .where(eq(worldBooks.ownerId, ownerId));
    const deleted = await ctx.db
      .delete(worldEntries)
      .where(and(eq(worldEntries.id, entryId), inArray(worldEntries.worldBookId, ownedBooks)))
      .returning({ id: worldEntries.id });
    if (deleted.length === 0) {
      throw new WorldInfoNotFoundError("world_entry", entryId);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.removeEntry",
        entityType: "world_entry",
        entityId: entryId,
      },
      ctx.now(),
    );
    return { deleted: true };
  };
}
