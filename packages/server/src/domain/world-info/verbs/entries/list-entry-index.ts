// verb: listEntryIndex — the lean per-book entry index a machine writer reads (D59). The
// keeper builds its merge/dedup prompt from the existing titles + counts them against KEEPER_ENTRY_CAP; it
// needs neither content nor economics, so this projects only (title, keys). Owner-gated on the book (a writer
// only indexes a book it owns — the same `loadOwnedBook` gate as every entry read).

import type { LoreEntryIndexRow } from "@orb/contracts/world-info";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { ListEntryIndexParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listBookEntries, loadOwnedBook } from "../../persistence/queries.ts";

export function createListEntryIndex(ctx: WorldInfoContext): WorldInfoService["listEntryIndex"] {
  return async ({ principal, bookId }: ListEntryIndexParams): Promise<readonly LoreEntryIndexRow[]> => {
    const book = await loadOwnedBook(ctx.db, principal.userId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const rows = await listBookEntries(ctx.db, bookId);
    return rows.map((row) => ({ title: row.title, keys: row.keys ?? [] }));
  };
}
