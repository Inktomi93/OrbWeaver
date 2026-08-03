// verb: getBook — one owned book by id (owner-scoped). Throws `WorldInfoNotFoundError` when it doesn't
// exist OR isn't the caller's — the two collapse into one answer (no foreign-existence leak). A read: no audit.

import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { GetBookParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { loadOwnedBook, toBookView } from "../../persistence/queries.ts";

export function createGet(ctx: WorldInfoContext): WorldInfoService["getBook"] {
  return async ({ principal, bookId }: GetBookParams) => {
    const row = await loadOwnedBook(ctx.db, principal.userId, bookId);
    if (row === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    return toBookView(row);
  };
}
