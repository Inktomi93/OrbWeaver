// verb: list — the caller's personas, newest first (owner-scoped off `principal.userId`). A read: no audit.

import type { ListPersonasParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";
import { detailOf, listOwnedPersonasWithAvatar } from "../persistence/queries";

export function createList(ctx: PersonaContext): PersonaService["list"] {
  return async ({ principal }: ListPersonasParams) => {
    const rows = await listOwnedPersonasWithAvatar(ctx.db, principal.userId);
    return rows.map(detailOf);
  };
}
