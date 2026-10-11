// verb: listAttachmentsForBook — the owner-scoped reverse index required by the book activation roster.
// Returns only character ids + roles and persona ids; chat scope remains membership-gated in the room.
// TWO gates, not one: `loadOwnedBook` proves the BOOK, and the persistence read carries the same ownerId
// through to the TARGETS (a junction may name another owner's character/persona — D18's inherited scope).

import type { WorldInfoContext } from "#src/domain/world-info/context.ts";
import { WorldInfoNotFoundError } from "#src/domain/world-info/contract/errors.ts";
import type { ListAttachmentsForBookParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listAttachmentTargetsForBook, loadOwnedBook } from "#src/domain/world-info/persistence/queries.ts";

export function createListAttachmentsForBook(ctx: WorldInfoContext): WorldInfoService["listAttachmentsForBook"] {
  return async ({ principal, bookId }: ListAttachmentsForBookParams) => {
    const ownerId = principal.userId;
    if ((await loadOwnedBook(ctx.db, ownerId, bookId)) === undefined) {
      throw new WorldInfoNotFoundError("world_book", bookId);
    }
    return listAttachmentTargetsForBook(ctx.db, ownerId, bookId);
  };
}
