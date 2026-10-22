// verb: listConnectedToCharacter — personas connected to a character, owner-scoped, newest first. The
// character must belong to the caller (gate first). Reuses the avatar LEFT JOIN + `detailOf` so connected
// personas render identically to a plain list. A read: no audit.

import type { ListConnectedParams } from "#src/domain/persona/contract/params.ts";
import type { PersonaContext, PersonaService } from "#src/domain/persona/contract/service.ts";
import { detailOf, ensureCharacterOwned, listConnectedPersonasWithAvatar } from "#src/domain/persona/persistence/queries.ts";

export function createListConnected(ctx: PersonaContext): PersonaService["listConnectedToCharacter"] {
  return async ({ principal, characterId }: ListConnectedParams) => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    const rows = await listConnectedPersonasWithAvatar(ctx.db, ownerId, characterId);
    return rows.map(detailOf);
  };
}
