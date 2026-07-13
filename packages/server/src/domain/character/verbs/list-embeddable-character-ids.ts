// verb: listEmbeddableCharacterIds — the embeddings embed pass's enumeration read (PD-53). UN-PRINCIPAL by
// design (D20): the vector substrate carries NO `ownerId`, so the catch-up sweep (a trusted SYSTEM consumer,
// never a user-facing surface) enumerates non-synthetic characters with no `can()` gate — the same deliberate
// exception `loadCardText` documents. `ownerId` scopes to ONE owner (the workloads SINGULAR sweep: embed MY
// corpus), omitted/null = ALL owners (the BULK dev sweep). Wired only into the embeddings service at the
// composition root, never exposed on the transport surface.
//
// Synthetic group buckets are excluded at the source: they carry no real card text and are never embedded
// — excluding them here keeps the pass's scanned/skipped counts honest instead of
// funneling every synthetic row through a null `loadCardText` skip.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterContext } from "../context";
import type { CharacterService } from "../contract/service";
import { listEmbeddableCharacterIdRows } from "../persistence/queries";

export function createListEmbeddableCharacterIds(
  ctx: CharacterContext,
): CharacterService["listEmbeddableCharacterIds"] {
  return (ownerId?: UserId | null): Promise<readonly CharacterId[]> =>
    listEmbeddableCharacterIdRows(ctx.db, ownerId);
}
