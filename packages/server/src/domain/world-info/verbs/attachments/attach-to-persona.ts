// verb: attachToPersona — attach an owned book to an owned persona (the persona-book JOIN; idempotent on the
// composite key). Gates BOTH sides: the persona (`ensurePersonaOwned` — a sanctioned `personas` schema read)
// AND the book (`loadOwnedBook`). The pool's persona source-tagging (`{{user}}` resolving against the
// speaking participant's active persona) is a Phase-5 chat/pool concern — this domain only stores the join.

import { personaBooks } from "@orb/db";
import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { AttachToPersonaParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { ensurePersonaOwned } from "../../persistence/ownership.ts";
import { loadOwnedBook } from "../../persistence/queries.ts";

export function createAttachToPersona(ctx: WorldInfoContext): WorldInfoService["attachToPersona"] {
  return async ({ principal, personaId, bookId }: AttachToPersonaParams) => {
    const ownerId = principal.userId;
    const [, book] = await Promise.all([ensurePersonaOwned(ctx.db, ownerId, personaId), loadOwnedBook(ctx.db, ownerId, bookId)]);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const at = ctx.now();
    await ctx.db.insert(personaBooks).values({ personaId, worldBookId: bookId, createdAt: at }).onConflictDoNothing();
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.attachToPersona",
        entityType: "world_book",
        entityId: bookId,
        metadata: { personaId },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
  };
}
