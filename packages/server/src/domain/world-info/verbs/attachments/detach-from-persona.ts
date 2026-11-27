// verb: detachFromPersona — remove a book↔persona attachment (idempotent — a no-op when already
// absent). Gates persona ownership (`ensurePersonaOwned`). Only a real removal audits.

import { personaBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { DetachFromPersonaParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { ensurePersonaOwned } from "#src/domain/world-info/persistence/ownership.ts";

export function createDetachFromPersona(ctx: WorldInfoContext): WorldInfoService["detachFromPersona"] {
  return async ({ principal, personaId, bookId }: DetachFromPersonaParams) => {
    const ownerId = principal.userId;
    await ensurePersonaOwned(ctx.db, ownerId, personaId);
    const at = ctx.now();
    const fanReach = await ctx.captureRoomReachForDelete(bookId);
    const removed = await ctx.db
      .delete(personaBooks)
      .where(and(eq(personaBooks.personaId, personaId), eq(personaBooks.worldBookId, bookId)))
      .returning({ worldBookId: personaBooks.worldBookId });
    if (removed.length === 0) {
      return;
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
    fanReach();
  };
}
