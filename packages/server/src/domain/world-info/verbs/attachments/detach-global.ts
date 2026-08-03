// verb: detachGlobal — un-mark an owned book global (idempotent — `detached:false` when not global). Gates
// book ownership (`loadOwnedBook`) so a caller can't clear another user's global flag. Only a real removal
// audits.

import { globalBooks } from "@orb/db";
import { eq } from "drizzle-orm";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { DetachGlobalParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { loadOwnedBook } from "../../persistence/queries.ts";

export function createDetachGlobal(ctx: WorldInfoContext): WorldInfoService["detachGlobal"] {
  return async ({ principal, bookId }: DetachGlobalParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const at = ctx.now();
    const removed = await ctx.db.delete(globalBooks).where(eq(globalBooks.worldBookId, bookId)).returning({ worldBookId: globalBooks.worldBookId });
    if (removed.length === 0) {
      return { detached: false };
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.detachGlobal",
        entityType: "world_book",
        entityId: bookId,
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return { detached: true };
  };
}
