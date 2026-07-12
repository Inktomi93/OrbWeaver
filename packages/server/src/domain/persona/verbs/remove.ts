// verb: remove — delete an owned persona. DELETE … WHERE id=? AND owner_id=? RETURNING folds the
// ownership check + the deletion into one round-trip; an empty result = not owned / not found → typed
// NotFound. The DB does the cascade-safety: `character_personas` rows CASCADE; `messages.personaId` is
// SET NULL (a deleted persona never orphans a message). Only a real deletion audits.
//
// THE LAST-PERSONA BELT (PD-100 rider): deleting the caller's FINAL persona is refused (`last_persona`) —
// setup forces one persona and chat attribution falls back to the participant's active persona, so at least
// one must always exist. The guard fires only when the target IS the caller's sole persona: a not-owned /
// missing target still collapses to the leak-free NotFound below (the delete matches nothing).

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import { LastPersonaError, PersonaNotFoundError } from "../contract/errors";
import type { RemovePersonaParams } from "../contract/params";
import type { PersonaContext, PersonaService } from "../contract/service";

/** One more row than "last" — the guard only needs to know whether a SECOND persona exists. */
const LAST_PERSONA_PROBE = 2;

export function createRemove(ctx: PersonaContext): PersonaService["remove"] {
  return async ({ principal, personaId }: RemovePersonaParams) => {
    const ownerId = principal.userId;
    const owned = await ctx.db
      .select({ id: personas.id })
      .from(personas)
      .where(eq(personas.ownerId, ownerId))
      .limit(LAST_PERSONA_PROBE);
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

    // Owner invariant "never NO current persona while you own one": if the deleted persona was the global
    // current/default pointer, re-point it (default -> first remaining -> null) so a live consumer never
    // holds a dangling pointer. Injected settings write (persona imports no other domain); runs AFTER the
    // delete commits so the re-point sees the post-delete roster. A no-op unless a seed named `personaId`.
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
