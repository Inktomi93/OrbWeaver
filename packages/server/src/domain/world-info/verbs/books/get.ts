// verb: getBook — one owned book by id (owner-scoped). Throws `WorldInfoNotFoundError` when it doesn't
// exist OR isn't the caller's — the two collapse into one answer (no foreign-existence leak). A read: no audit.

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import { WorldInfoNotFoundError } from "#src/domain/world-info/contract/errors.ts";
import type { GetBookParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { loadOwnedBook, toBookView } from "#src/domain/world-info/persistence/queries.ts";

export function createGet(ctx: WorldInfoContext): WorldInfoService["getBook"] {
  return async ({ principal, bookId }: GetBookParams) => {
    const row = await loadOwnedBook(ctx.db, principal.userId, bookId);
    if (row === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    return toBookView(row);
  };
}
