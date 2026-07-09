// verb: connectToCharacter — link a persona to a character (idempotent). BOTH must belong to the caller
// (the two ownership gates run concurrently; either failing throws a typed NotFound). A re-connect is a UI
// no-op (the toggle is already on), not an error — `onConflictDoNothing` on the composite PK.

import { characterPersonas } from "@orb/db";
import type { ConnectParams } from "../../contract/params";
import type { PersonaContext, PersonaService } from "../../contract/service";
import { ensureCharacterOwned, ensurePersonaOwned } from "../../persistence/queries";

export function createConnect(ctx: PersonaContext): PersonaService["connectToCharacter"] {
  return async ({ principal, characterId, personaId }: ConnectParams) => {
    const ownerId = principal.userId;
    await Promise.all([
      ensureCharacterOwned(ctx.db, ownerId, characterId),
      ensurePersonaOwned(ctx.db, ownerId, personaId),
    ]);
    const at = ctx.now();
    await ctx.db
      .insert(characterPersonas)
      .values({ characterId, personaId, createdAt: at })
      .onConflictDoNothing();
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.connectToCharacter",
        entityType: "persona",
        entityId: personaId,
        metadata: { characterId },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });
  };
}
