// verb: listForPersona — the books attached to an owned persona, newest first. `role` is null on this scope.
// Gates persona ownership (`ensurePersonaOwned`). A read: no audit.

import type { ListForPersonaParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { ensurePersonaOwned } from "../../persistence/ownership";
import { listPersonaBooks } from "../../persistence/queries";

export function createListForPersona(ctx: WorldInfoContext): WorldInfoService["listForPersona"] {
  return async ({ principal, personaId }: ListForPersonaParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    return listPersonaBooks(ctx.db, ownerId, personaId);
  };
}
