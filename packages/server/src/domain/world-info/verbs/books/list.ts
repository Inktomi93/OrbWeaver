// verb: listBooks — the caller's books, newest first (owner-scoped off `principal.userId`). A read: no audit.

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import type { ListBooksParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listOwnedBooks, toBookView } from "#src/domain/world-info/persistence/queries.ts";

export function createList(ctx: WorldInfoContext): WorldInfoService["listBooks"] {
  return async ({ principal }: ListBooksParams) => {
    const rows = await listOwnedBooks(ctx.db, principal.userId);
    return rows.map(toBookView);
  };
}
