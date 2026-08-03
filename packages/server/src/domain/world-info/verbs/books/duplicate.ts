// verb: duplicateBook — deep-copy an owned book + ALL its entries into a fresh `"<name> (copy)"` book.
// Everything in ONE atomic `db.batch`: a crash can't leave a partial entry set. New ids for the book AND
// every entry; `createdAt` is `now` (not copied). Each entry row is spread verbatim (title/description/
// content/keys/enabled/priority/ignoreBudget/metadata carry over) with only `id`/`worldBookId`/`createdAt`
// overridden. Attachments are NOT copied — the duplicate is a fresh editable copy, unattached at every scope.

import { worldBooks, worldEntries } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { DuplicateBookParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listBookEntries, loadOwnedBook } from "../../persistence/queries.ts";

export function createDuplicate(ctx: WorldInfoContext): WorldInfoService["duplicateBook"] {
  return async ({ principal, bookId }: DuplicateBookParams) => {
    const ownerId = principal.userId;
    const source = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (source === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }

    const at = ctx.now();
    const newBookId = ctx.newBookId();
    const newName = `${source.name} (copy)`;
    const entries = await listBookEntries(ctx.db, bookId);

    const stmts = [
      ctx.db.insert(worldBooks).values({
        id: newBookId,
        ownerId,
        name: newName,
        description: source.description,
        createdAt: at,
      }),
      ...entries.map((e) => ctx.db.insert(worldEntries).values({ ...e, id: ctx.newEntryId(), worldBookId: newBookId, createdAt: at })),
    ];
    await ctx.db.batch(batchMany(stmts));

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.duplicateBook",
        entityType: "world_book",
        entityId: newBookId,
        metadata: { sourceBookId: bookId, entryCount: entries.length },
      },
      at,
    );

    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId: newBookId });
    return { id: newBookId, name: newName, description: source.description, createdAt: at };
  };
}
