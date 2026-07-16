// verb: attachGlobal — mark an owned book global (fires for every chat). The gate is plain book ownership
// (`loadOwnedBook`) — a user can only make their OWN book global, no admin/owner role check (world info is
// user-owned). `global_books` keys on the book id alone (orbweaver schema: a book is either global or not —
// ownership derives through `world_books.ownerId`, D23; differs from neo's per-user junction). Idempotent.

import { globalBooks } from "@orb/db";
import type { WorldInfoContext } from "../../context";
import { WorldInfoNotFoundError } from "../../contract/errors";
import type { AttachGlobalParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { loadOwnedBook } from "../../persistence/queries";

export function createAttachGlobal(ctx: WorldInfoContext): WorldInfoService["attachGlobal"] {
  return async ({ principal, bookId }: AttachGlobalParams) => {
    const ownerId = principal.userId;
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    const at = ctx.now();
    await ctx.db.insert(globalBooks).values({ worldBookId: bookId, createdAt: at }).onConflictDoNothing();
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "worldInfo.attachGlobal",
        entityType: "world_book",
        entityId: bookId,
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "worldInfoChanged", bookId });
  };
}
