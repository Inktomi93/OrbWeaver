// verb: removeEntry — delete an entry, owner-scoped via the owned-book `inArray` subquery (invariant #4 —
// never a bare `eq(id)`). DELETE … WHERE id=? AND worldBookId IN (caller's books) RETURNING folds the gate +
// the deletion into one round-trip; an empty result = not owned / not found → typed NotFound.
//
// PD-89: a removed entry leaves the WI pool of every chat the book is attached to — fan out `wiEntryDetached`
// over `listChatIdsForBook`, read off the deleted row's `worldBookId` (the RETURNING clause below), so the
// fan-out target is known WITHOUT a pre-delete read. Empty fan-out (book attached to zero chats) is correct.

import { worldBooks, worldEntries } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { RemoveEntryParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { listChatIdsForBook } from "../../persistence/queries";

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
      .returning({ id: worldEntries.id, worldBookId: worldEntries.worldBookId });
    const removed = deleted[0];
    if (removed === undefined) {
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

    const chatIds = await listChatIdsForBook(ctx.db, removed.worldBookId);
    for (const chatId of chatIds) {
      // biome-ignore lint/performance/noAwaitInLoops: the chat bus assigns a monotonic seq per emit — fan-out emits are sequential (create.ts precedent).
      await ctx.emitWiEvent({ type: "wiEntryDetached", chatId, surface: "chat", entryId });
    }

    return { deleted: true };
  };
}
