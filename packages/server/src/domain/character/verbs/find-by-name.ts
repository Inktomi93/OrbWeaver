// verb: findByName — the import re-link by the name the user sees: an ST transcript names its character by
// display name, never by handle. Owner-scoped in the query; names are not unique, so every match returns and
// the caller rules on an ambiguity. A read: no audit, no emit.

import type { FindByNameParams } from "../contract/params.ts";
import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { findByOwnerName } from "../persistence/queries.ts";

export function createFindByName(ctx: CharacterContext): CharacterService["findByName"] {
  return async ({ ownerId, name, caseInsensitive }: FindByNameParams) =>
    (await findByOwnerName(ctx.db, ownerId, name, caseInsensitive)).map((characterId) => ({ characterId }));
}
