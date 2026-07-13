// verb: listBooks — the caller's books, newest first (owner-scoped off `principal.userId`). A read: no audit.

import type { WorldInfoContext } from "../../context";
import type { ListBooksParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { listOwnedBooks, toBookView } from "../../persistence/queries";

export function createList(ctx: WorldInfoContext): WorldInfoService["listBooks"] {
  return async ({ principal }: ListBooksParams) => {
    const rows = await listOwnedBooks(ctx.db, principal.userId);
    return rows.map(toBookView);
  };
}
