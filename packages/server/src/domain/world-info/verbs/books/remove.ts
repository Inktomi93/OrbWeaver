// verb: removeBook — delete an owned book. DELETE … WHERE id=? AND owner_id=? RETURNING folds the ownership
// check + the deletion into one round-trip; an empty result = not owned / not found → typed NotFound. The DB
// does the cascade-safety: the book's `world_entries` AND all four scope-junction rows CASCADE away. Only a
// real deletion audits.

import { worldBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { RemoveBookParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";

export function createRemove(ctx: WorldInfoContext): WorldInfoService["removeBook"] {
  return async ({ principal, bookId }: RemoveBookParams) => {
    const ownerId = principal.userId;

    // PRE-WRITE reach capture (entity→room bridge §3.6 residual): the delete below CASCADEs all four scope
    // junctions, so a post-write reach resolves ∅. Snapshot the rooms whose per-turn pool reads this book NOW,
    // fan the captured set AFTER the row is gone (fanReach() past the NotFound guard).
    const fanReach = await ctx.captureRoomReachForDelete(bookId);

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
    // The ROOM plane (§3.6 residual): every room whose per-turn pool read this book now assembles without it;
    // the captured-set fan repaints their fit/preview. Post-cascade, so the reach was snapshotted pre-write.
    // Live-only + past the delete's success path — it cannot fault the write that already committed.
    fanReach();
    return { deleted: true };
  };
}
