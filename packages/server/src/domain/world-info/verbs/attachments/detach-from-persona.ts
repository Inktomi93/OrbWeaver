// verb: detachFromPersona — remove a book↔persona attachment (idempotent — `detached:false` when already
// absent). Gates persona ownership (`ensurePersonaOwned`). Only a real removal audits.

import { personaBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { WorldInfoContext } from "../../context";
import type { DetachFromPersonaParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { ensurePersonaOwned } from "../../persistence/ownership";

export function createDetachFromPersona(ctx: WorldInfoContext): WorldInfoService["detachFromPersona"] {
  return async ({ principal, personaId, bookId }: DetachFromPersonaParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    const at = ctx.now();
    const removed = await ctx.db
      .delete(personaBooks)
      .where(and(eq(personaBooks.personaId, personaId), eq(personaBooks.worldBookId, bookId)))
      .returning({ worldBookId: personaBooks.worldBookId });
    if (removed.length === 0) {
      return { detached: false };
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.detachFromPersona",
        entityType: "world_book",
        entityId: bookId,
        metadata: { personaId },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return { detached: true };
  };
}
