// verb: listAttachmentsForBook — the owner-scoped reverse index required by the book activation roster.
// Returns only character ids + roles and persona ids; chat scope remains membership-gated in the room.

import type { WorldInfoContext } from "../../context.ts";
import { WorldInfoNotFoundError } from "../../contract/errors.ts";
import type { ListAttachmentsForBookParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listAttachmentTargetsForBook, loadOwnedBook } from "../../persistence/queries.ts";

export function createListAttachmentsForBook(ctx: WorldInfoContext): WorldInfoService["listAttachmentsForBook"] {
  return async ({ principal, bookId }: ListAttachmentsForBookParams) => {
    if ((await loadOwnedBook(ctx.db, principal.userId, bookId)) === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    return listAttachmentTargetsForBook(ctx.db, bookId);
  };
}
