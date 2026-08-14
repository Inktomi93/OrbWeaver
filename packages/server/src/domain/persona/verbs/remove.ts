// verb: remove — delete an owned persona. DELETE ... WHERE id=? AND owner_id=? RETURNING folds the
// ownership check + deletion into one round-trip; an empty result is the leak-free NotFound. Deleting the
// caller's final persona is refused (last_persona) — at least one must always exist for chat attribution to
// fall back to.

import { personas } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { PersonaContext } from "../context.ts";
import { LastPersonaError, PersonaNotFoundError } from "../contract/errors.ts";
import type { RemovePersonaParams } from "../contract/params.ts";
import type { PersonaService } from "../contract/service.ts";

/** One more row than "last" — the guard only needs to know whether a SECOND persona exists. */
const LAST_PERSONA_PROBE = 2;

export function createRemove(ctx: PersonaContext): PersonaService["remove"] {
  return async ({ principal, personaId }: RemovePersonaParams) => {
    const ownerId = principal.userId;
    const owned = await ctx.db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, ownerId)).limit(LAST_PERSONA_PROBE);
    if (owned.length === 1 && owned[0]?.id === personaId) {
      throw new LastPersonaError(personaId);
    }

    // PRE-WRITE reach capture (entity→room bridge §3.6 residual): the delete below NULLs every seat's
    // activePersonaId + every chat's anchorPersonaId, so a post-write reach resolves ∅. Snapshot the rooms this
    // persona is live in NOW, fan the captured set AFTER the row is gone (fanReach() past the NotFound guard).
    const fanReach = await ctx.captureRoomReachForDelete(personaId);

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
    // The ROOM plane (§3.6 residual): every co-member seated on / anchored by this persona now re-reads the
    // clamped roster and finds the seat fell back — the captured-set fan repaints them. Live-only + past the
    // delete's success path, so it cannot fault the write that already committed.
    fanReach();
    return { deleted: true };
  };
}
