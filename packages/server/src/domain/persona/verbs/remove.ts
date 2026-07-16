// verb: remove — delete an owned persona. DELETE ... WHERE id=? AND owner_id=? RETURNING folds the
// ownership check + deletion into one round-trip; an empty result is the leak-free NotFound. Deleting the
// caller's final persona is refused (last_persona) — at least one must always exist for chat attribution to
// fall back to.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { PersonaContext } from "../context";
import { LastPersonaError, PersonaNotFoundError } from "../contract/errors";
import type { RemovePersonaParams } from "../contract/params";
import type { PersonaService } from "../contract/service";

/** One more row than "last" — the guard only needs to know whether a SECOND persona exists. */
const LAST_PERSONA_PROBE = 2;

export function createRemove(ctx: PersonaContext): PersonaService["remove"] {
  return async ({ principal, personaId }: RemovePersonaParams) => {
    const ownerId = principal.userId;
    const owned = await ctx.db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, ownerId)).limit(LAST_PERSONA_PROBE);
    if (owned.length === 1 && owned[0]?.id === personaId) {
      throw new LastPersonaError(personaId);
    }
    const deleted = await ctx.db
      .delete(personas)
      .where(and(eq(personas.id, personaId), eq(personas.ownerId, ownerId)))
      .returning({ id: personas.id });
    if (deleted.length === 0) {
      throw new PersonaNotFoundError(personaId);
    }

    // Re-point any default/current pointer left dangling by this delete (no-op unless a seed named personaId).
    await ctx.repointSeedsAfterPersonaDelete(ownerId, personaId);

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "persona.remove",
        entityType: "persona",
        entityId: personaId,
      },
      ctx.now(),
    );
    ctx.emitUserEvent(ownerId, { type: "personasChanged", personaId });
    return { deleted: true };
  };
}
