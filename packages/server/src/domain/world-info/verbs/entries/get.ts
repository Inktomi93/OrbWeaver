// verb: getEntry — one entry, owner-scoped via its book (`loadOwnedEntry` joins through `world_books`).
// Throws `WorldInfoNotFoundError` when it doesn't exist OR isn't the caller's. A read: no audit.

import type { WorldInfoContext } from "../../context";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { GetEntryParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { loadOwnedEntry, toEntryView } from "../../persistence/queries";

export function createGet(ctx: WorldInfoContext): WorldInfoService["getEntry"] {
  return async ({ principal, entryId }: GetEntryParams) => {
    const row = await loadOwnedEntry(ctx.db, principal.userId, entryId);
    if (row === undefined) {
      throw new WorldInfoNotFoundError("world_entry", entryId);
    }
    return toEntryView(row);
  };
}
