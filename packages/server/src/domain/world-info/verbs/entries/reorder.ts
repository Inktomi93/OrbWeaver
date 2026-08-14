// verb: applyEntryOrder — rewrite the display/injection order of an owned book's entries into the `priority`
// column (no separate order column; `listEntries` reads `priority DESC`). Book ownership gated first; the
// supplied ids are intersected with the book's real entries (stale/foreign ids dropped, caller order
// preserved); entries in the book but absent from the list keep their existing priority. Position i →
// `priority = N - i` (position 0 → highest = N, last → 1; always positive + distinct). One atomic batch.

import { worldEntries } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { eq } from "drizzle-orm";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { ApplyEntryOrderParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listBookEntries, loadOwnedBook } from "../../persistence/queries.ts";

export function createReorder(ctx: WorldInfoContext): WorldInfoService["applyEntryOrder"] {
  return async ({ principal, bookId, orderedEntryIds }: ApplyEntryOrderParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    if (orderedEntryIds.length === 0) {
      return { reordered: 0 };
    }

    const owned = new Set((await listBookEntries(ctx.db, bookId)).map((e) => e.id));
    const ids = orderedEntryIds.filter((id) => owned.has(id));
    if (ids.length === 0) {
      return { reordered: 0 };
    }

    const at = ctx.now();
    const total = ids.length;
    const stmts = ids.map((id, i) =>
      ctx.db
        .update(worldEntries)
        .set({ priority: total - i, updatedAt: at })
        .where(eq(worldEntries.id, id)),
    );
    await ctx.db.batch(batchMany(stmts));

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.applyEntryOrder",
        entityType: "world_book",
        entityId: bookId,
        metadata: { reordered: ids.length },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    // The ROOM plane (entity→room bridge §3.6): priority IS the injection order, so a reorder changes what
    // survives the per-turn WI budget — an assembly change with no entry-level event of its own.
    ctx.emit({ type: "world-info.updated", bookId });
    return { reordered: ids.length };
  };
}
