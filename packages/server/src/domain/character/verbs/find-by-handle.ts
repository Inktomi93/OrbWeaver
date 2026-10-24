// verb: findByHandle — the default-card seeder's partial-rerun resolve path: the caller's existing character
// that already carries `handle`, or `null`. Internal + seeder-injected (acts on the resolved `ownerId`, not a
// request principal — the import-hash/synthetic-find precedent). Owner-scoped in the query, so a different
// owner's same-handle card is never returned, and neither is a synthetic group row: a restore must never bind
// content to one (the free-handle probes cannot ask for one, the handle alphabet excludes `_`). A read: no
// audit, no emit.

import type { FindByHandleParams } from "../contract/params.ts";
import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { findByOwnerHandle } from "../persistence/queries.ts";

export function createFindByHandle(ctx: CharacterContext): CharacterService["findByHandle"] {
  return async ({ ownerId, handle }: FindByHandleParams) => {
    const row = await findByOwnerHandle(ctx.db, ownerId, handle);
    return row === undefined || row.synthetic ? null : { characterId: row.id };
  };
}
