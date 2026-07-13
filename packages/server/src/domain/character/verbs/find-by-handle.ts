// verb: findByHandle — the default-card seeder's partial-rerun resolve path: the caller's existing character
// that already carries `handle`, or `null`. Internal + seeder-injected (acts on the resolved `ownerId`, not a
// request principal — the import-hash/synthetic-find precedent). Owner-scoped in the query, so a different
// owner's same-handle card is never returned. A read: no audit, no emit.

import type { CharacterContext } from "../context";
import type { FindByHandleParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { findByOwnerHandle } from "../persistence/queries";

export function createFindByHandle(ctx: CharacterContext): CharacterService["findByHandle"] {
  return async ({ ownerId, handle }: FindByHandleParams) => {
    const row = await findByOwnerHandle(ctx.db, ownerId, handle);
    return row === undefined ? null : { characterId: row.id };
  };
}
