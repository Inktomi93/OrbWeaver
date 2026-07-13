// verb: disconnectFromCharacter — remove a persona⇄character link (idempotent). BOTH must belong to the
// caller. RETURNING tells us whether a row actually went away, so the caller distinguishes a real
// disconnect from a no-op without a separate existence probe — and only a real one audits.

import { characterPersonas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { PersonaContext } from "../../context";
import type { DisconnectParams } from "../../contract/params";
import type { PersonaService } from "../../contract/service";
import { ensureCharacterOwned, ensurePersonaOwned } from "../../persistence/queries";

export function createDisconnect(ctx: PersonaContext): PersonaService["disconnectFromCharacter"] {
  return async ({ principal, characterId, personaId }: DisconnectParams) => {
    const ownerId = principal.userId;
    await Promise.all([
      ensureCharacterOwned(ctx.db, ownerId, characterId),
      ensurePersonaOwned(ctx.db, ownerId, personaId),
    ]);
    const deleted = await ctx.db
      .delete(characterPersonas)
      .where(
        and(
          eq(characterPersonas.characterId, characterId),
          eq(characterPersonas.personaId, personaId),
        ),
      )
      .returning({ personaId: characterPersonas.personaId });
    const disconnected = deleted.length > 0;
    if (disconnected) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "persona.disconnectFromCharacter",
          entityType: "persona",
          entityId: personaId,
          metadata: { characterId },
        },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });
    }
    return { disconnected };
  };
}
