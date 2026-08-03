// verb: findByImportedFrom — the batched provenance oracle backing the hub search page's already-imported
// markers (doc 03 §2.1). Internal + hub-injected (acts on the resolved `ownerId`, not a request principal —
// the synthetic-find precedent). Owner-scoped in the query, so a different owner's same-provenance card is
// never returned. A read: no audit, no emit. Returns one match per FOUND value (absent values are simply not
// in the result — the caller builds a value→id map).

import type { CharacterContext } from "../context.ts";
import type { FindByImportedFromParams } from "../contract/params.ts";
import type { ImportedFromMatch } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import { findByOwnerImportedFrom } from "../persistence/queries.ts";

export function createFindByImportedFrom(ctx: CharacterContext): CharacterService["findByImportedFrom"] {
  return ({ ownerId, values }: FindByImportedFromParams): Promise<ImportedFromMatch[]> => findByOwnerImportedFrom(ctx.db, ownerId, values);
}
