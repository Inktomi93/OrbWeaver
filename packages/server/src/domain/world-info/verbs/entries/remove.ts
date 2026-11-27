// verb: removeEntry — delete an entry, owner-scoped via the owned-book `inArray` subquery (never a bare
// `eq(id)`). The owned entry is read first, for its book: the surviving entries cannot say a removal happened, so the
// book's `entries_changed_at` is stamped in the same batch, BEFORE the delete, and only while the entry still exists.
// That stamp's `rowsAffected` is the verdict: 0 = not owned / already gone → typed NotFound, with no stamp left behind.
//
// A removed entry leaves the WI pool of every chat the book is attached to — fan out `wiEntryDetached`
// over `listChatIdsForBook` for the book read before the delete. Empty fan-out (book attached to zero chats) is correct.

import { worldBooks, worldEntries } from "@orb/db";
import { batchLed } from "@orb/db/query";
import { and, eq, inArray } from "drizzle-orm";
import { WorldInfoNotFoundError } from "#src/domain/world-info/contract/errors.ts";
import type { RemoveEntryParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listChatIdsForBook, loadOwnedEntry, stampEntriesChanged } from "#src/domain/world-info/persistence/queries.ts";

export function createRemoveEntry(ctx: WorldInfoContext): WorldInfoService["removeEntry"] {
  return async ({ principal, entryId }: RemoveEntryParams) => {
    const ownerId = principal.userId;
    const ownedBooks = ctx.db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId));
    const current = await loadOwnedEntry(ctx.db, ownerId, entryId);
    if (current === undefined) {
      throw new WorldInfoNotFoundError("world_entry", entryId);
    }
    const at = ctx.now();
    const [stamped] = await ctx.db.batch(
      batchLed(stampEntriesChanged(ctx.db, current.worldBookId, at, entryId), [
        ctx.db.delete(worldEntries).where(and(eq(worldEntries.id, entryId), inArray(worldEntries.worldBookId, ownedBooks))),
      ]),
    );
    if (stamped.rowsAffected === 0) {
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

    const chatIds = await listChatIdsForBook(ctx.db, current.worldBookId);
    for (const chatId of chatIds) {
      await ctx.emitWiEvent({ type: "wiEntryDetached", chatId, surface: "chat", entryId });
    }
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId: current.worldBookId });
    // The ROOM plane (entity→room bridge §3.6). Safe on a DELETE here — unlike a book delete — because the
    // BOOK survives an entry removal, so the reach junctions are all intact when the engine resolves.
    ctx.emit({ type: "world-info.updated", bookId: current.worldBookId });
  };
}
