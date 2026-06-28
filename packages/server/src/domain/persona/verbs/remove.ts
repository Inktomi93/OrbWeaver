// verb: remove — delete an owned persona. DELETE … WHERE id=? AND owner_id=? RETURNING folds the
// ownership check + the deletion into one round-trip; an empty result = not owned / not found → typed
// NotFound. The DB does the cascade-safety: `character_personas` rows CASCADE; `messages.personaId` is
// SET NULL (a deleted persona never orphans a message). Only a real deletion audits.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { PersonaNotFoundError } from "../contract/errors";
import type { RemovePersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";

export function createRemove(ctx: PersonaContext): PersonaService["remove"] {
  return async ({ principal, personaId }: RemovePersonaParams) => {
    const ownerId = principal.userId;
    const deleted = await ctx.db
      .delete(personas)
      .where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)))
      .returning({ id: personas.id });
    if (deleted.length === 0) {
      throw new PersonaNotFoundError(personaId);
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.remove",
        entityType: "persona",
        entityId: personaId,
      },
      ctx.now(),
    );
    return { deleted: true };
  };
}
