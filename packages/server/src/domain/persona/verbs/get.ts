// verb: get — one owned persona by id (owner-scoped). Throws `PersonaNotFoundError` when it doesn't exist
// OR isn't the caller's — the two collapse into one answer (no foreign-existence leak). A read: no audit.

import type { PersonaContext } from "../context.ts";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { GetPersonaParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";
import { detailOf, loadOwnedPersonaWithAvatar } from "../persistence/queries.ts";

export function createGet(ctx: PersonaContext): PersonaService["get"] {
  return async ({ principal, personaId }: GetPersonaParams) => {
    const row = await loadOwnedPersonaWithAvatar(ctx.db, principal.userId, personaId);
    if (row === undefined) {
      throw new PersonaNotFoundError(personaId);
    }
    return detailOf(row);
  };
}
