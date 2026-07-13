// verb: createBook — mint a new book row owned by the caller. Ownership is scoped off `principal.userId`
// (the §7.1 source of truth — never a `users` read). The injected `newBookId`/`now` keep it deterministic
// (no ambient `mintTypeId()`/`Date.now()`). Returns the new book view, constructed from the inserted values
// (a book has no joined data, so no re-read is needed).

import { worldBooks } from "@orb/db";
import type { WorldInfoContext } from "../../context";
import type { CreateBookParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";

export function createCreate(ctx: WorldInfoContext): WorldInfoService["createBook"] {
  return async ({ principal, input }: CreateBookParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();
    const bookId = ctx.newBookId();
    const description = input.description ?? null;

    await ctx.db.insert(worldBooks).values({
      id: bookId,
      ownerId,
      name: input.name,
      description,
      createdAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.createBook",
        entityType: "world_book",
        entityId: bookId,
        metadata: { name: input.name },
      },
      at,
    );

    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
    return { id: bookId, name: input.name, description, createdAt: at };
  };
}
