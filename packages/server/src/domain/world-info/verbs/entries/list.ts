// verb: listEntries — the entries of an owned book, by descending priority (the display + injection order).
// Guards book ownership first (via `loadOwnedBook`) so a caller can't probe a foreign book's entry set. A
// read: no audit.

import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { ListEntriesParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listBookEntries, loadOwnedBook, toEntryView } from "../../persistence/queries.ts";

export function createList(ctx: WorldInfoContext): WorldInfoService["listEntries"] {
  return async ({ principal, bookId }: ListEntriesParams) => {
    const book = await loadOwnedBook(ctx.db, principal.userId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const rows = await listBookEntries(ctx.db, bookId);
    return rows.map(toEntryView);
  };
}
