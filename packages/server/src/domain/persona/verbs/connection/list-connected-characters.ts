// verb: listConnectedCharacters — characters connected to a persona, the junction read from the PERSONA
// side (#866 S4: the editor's "Connected characters" section; `list-connected.ts` is the character-side
// twin). Owner-scoped: the persona must belong to the caller (gate first — a foreign/absent persona
// collapses to not-found, no existence leak). Summary views only. A read: no audit.

import type { PersonaContext } from "../../context.ts";
import type { ListConnectedCharactersParams } from "../../contract/params.ts";
import type { PersonaService } from "../../contract/service.ts";
import { ensurePersonaOwned, listConnectedCharactersOf } from "../../persistence/queries.ts";

export function createListConnectedCharacters(ctx: PersonaContext): PersonaService["listConnectedCharacters"] {
  return async ({ principal, personaId }: ListConnectedCharactersParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    return await listConnectedCharactersOf(ctx.db, ownerId, personaId);
  };
}
