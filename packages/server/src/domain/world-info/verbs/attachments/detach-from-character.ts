// verb: detachFromCharacter — remove a book↔character attachment (idempotent — `detached:false` when the
// row was already absent). Gates character ownership (`ensureCharacterOwned`); the junction row is scoped to
// that owned character. Only a real removal audits.

import { characterBooks } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { DetachFromCharacterParams } from "../../contract/params";
import type { WorldInfoContext, WorldInfoService } from "../../contract/service";
import { ensureCharacterOwned } from "../../persistence/ownership";

export function createDetachFromCharacter(
  ctx: WorldInfoContext,
): WorldInfoService["detachFromCharacter"] {
  return async ({ principal, characterId, bookId }: DetachFromCharacterParams) => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    const at = ctx.now();
    const removed = await ctx.db
      .delete(characterBooks)
      .where(
        and(eq(characterBooks.characterId, characterId), eq(characterBooks.worldBookId, bookId)),
      )
      .returning({ worldBookId: characterBooks.worldBookId });
    if (removed.length === 0) {
      return { detached: false };
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.detachFromCharacter",
        entityType: "world_book",
        entityId: bookId,
        metadata: { characterId },
      },
      at,
    );
    return { detached: true };
  };
}
