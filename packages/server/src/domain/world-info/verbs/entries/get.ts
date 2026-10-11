// verb: getEntry — one entry, owner-scoped via its book (`loadOwnedEntry` joins through `world_books`).
// Throws `WorldInfoNotFoundError` when it doesn't exist OR isn't the caller's. A read: no audit.

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import { WorldInfoNotFoundError } from "#src/domain/world-info/contract/errors.ts";
import type { GetEntryParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { loadOwnedEntry, toEntryView } from "#src/domain/world-info/persistence/queries.ts";

export function createGet(ctx: WorldInfoContext): WorldInfoService["getEntry"] {
  return async ({ principal, entryId }: GetEntryParams) => {
    const row = await loadOwnedEntry(ctx.db, principal.userId, entryId);
    if (row === undefined) {
      throw new WorldInfoNotFoundError("world_entry", entryId);
    }
    return toEntryView(row);
  };
}
