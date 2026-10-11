// verb: listForPersona — the books attached to an owned persona, newest first. `role` is null on this scope.
// Gates persona ownership (`ensurePersonaOwned`). A read: no audit.

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import type { ListForPersonaParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { ensurePersonaOwned } from "#src/domain/world-info/persistence/ownership.ts";
import { listPersonaBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createListForPersona(ctx: WorldInfoContext): WorldInfoService["listForPersona"] {
  return async ({ principal, personaId }: ListForPersonaParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    return listPersonaBooks(ctx.db, ownerId, personaId);
  };
}
