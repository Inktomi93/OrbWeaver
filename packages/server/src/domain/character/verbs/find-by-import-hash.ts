// verb: findByImportHash — the re-import dedup oracle: the caller's existing character that already carries
// `importHash`, or `null`. Internal + import-injected (acts on the resolved `ownerId`, not a request
// principal — the synthetic-find precedent). Owner-scoped in the query, so a different owner's same-hash card
// is never returned. A read: no audit, no emit.

import type { CharacterContext } from "../context";
import type { FindByImportHashParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { findByOwnerImportHash } from "../persistence/queries";

export function createFindByImportHash(ctx: CharacterContext): CharacterService["findByImportHash"] {
  return async ({ ownerId, importHash }: FindByImportHashParams) => {
    const characterId = await findByOwnerImportHash(ctx.db, ownerId, importHash);
    return characterId === undefined ? null : { characterId };
  };
}
