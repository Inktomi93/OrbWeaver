// verb: listForPersona — the books attached to an owned persona, newest first. `role` is null on this scope.
// Gates persona ownership (`ensurePersonaOwned`). A read: no audit.

import type { WorldInfoContext } from "../../context.ts";
import type { ListForPersonaParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { ensurePersonaOwned } from "../../persistence/ownership.ts";
import { listPersonaBooks } from "../../persistence/queries.ts";

export function createListForPersona(ctx: WorldInfoContext): WorldInfoService["listForPersona"] {
  return async ({ principal, personaId }: ListForPersonaParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    return listPersonaBooks(ctx.db, ownerId, personaId);
  };
}
