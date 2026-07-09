// verb: backfillTitles — fill the title of every BLANK-titled entry in an owned book from that entry's keys
// (comma-joined). Book ownership is gated first; the entries are then confirmed children of that owned book
// (so the per-row UPDATE keys on `eq(id)` safely — no extra owner gate needed). Entries with no keys are
// LEFT blank (no synthetic default). One atomic batch of the UPDATEs. Returns the fill count; only a real
// fill audits. Defends the import path — `createEntry` requires a non-empty title, so blanks come from
// legacy/ST-imported rows.

import { batchMany, worldEntries } from "@orb/db";
import { eq } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { BackfillTitlesParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { listBookEntries, loadOwnedBook } from "../../persistence/queries";

export function createBackfillTitles(ctx: WorldInfoContext): WorldInfoService["backfillTitles"] {
  return async ({ principal, bookId }: BackfillTitlesParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const entries = await listBookEntries(ctx.db, bookId);
    const updates = entries
      .filter((e) => (e.title ?? "").trim().length === 0)
      .map((e) => ({ id: e.id, title: (e.keys ?? []).join(", ").trim() }))
      .filter((u) => u.title.length > 0);

    if (updates.length === 0) {
      return { filled: 0 };
    }

    const at = ctx.now();
    const stmts = updates.map((u) =>
      ctx.db.update(worldEntries).set({ title: u.title }).where(eq(worldEntries.id, u.id)),
    );
    await ctx.db.batch(batchMany(stmts));

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.backfillTitles",
        entityType: "world_book",
        entityId: bookId,
        metadata: { filled: updates.length },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return { filled: updates.length };
  };
}
