// verb: listBooks — the caller's books, newest first (owner-scoped off `principal.userId`). A read: no audit.

import type { WorldInfoContext } from "../../context.ts";
import type { ListBooksParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listOwnedBooks, toBookView } from "../../persistence/queries.ts";

export function createList(ctx: WorldInfoContext): WorldInfoService["listBooks"] {
  return async ({ principal }: ListBooksParams) => {
    const rows = await listOwnedBooks(ctx.db, principal.userId);
    return rows.map(toBookView);
  };
}
