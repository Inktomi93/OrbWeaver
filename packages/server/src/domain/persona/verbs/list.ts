// verb: list — the caller's personas, newest first (owner-scoped off `principal.userId`). A read: no audit.

import type { PersonaContext } from "../context.ts";
import type { ListPersonasParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { detailOf, listOwnedPersonasWithAvatar } from "../persistence/queries.ts";

export function createList(ctx: PersonaContext): PersonaService["list"] {
  return async ({ principal }: ListPersonasParams) => {
    const rows = await listOwnedPersonasWithAvatar(ctx.db, principal.userId);
    return rows.map(detailOf);
  };
}
