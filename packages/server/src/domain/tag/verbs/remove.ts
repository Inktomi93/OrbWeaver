// verb: removeTag — owner-scoped delete. NOT idempotent (tag.md): removing a missing/foreign tag throws
// `TagNotFoundError`. All five junctions cascade via their FK `onDelete: cascade` (no manual junction sweep).

import { TagNotFoundError } from "../contract/errors";
import type { RemoveTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { deleteOwnedTag } from "../persistence/queries";

export function createRemove(ctx: TagContext): TagService["removeTag"] {
  return async (params: RemoveTagParams) => {
    const removed = await deleteOwnedTag(ctx.db, params.tagId, params.principal.userId);
    if (removed === 0) {
      throw new TagNotFoundError(params.tagId);
    }
  };
}
