// verb: removeTag — owner-scoped delete. NOT idempotent (deliberate): removing a missing/foreign tag throws
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
    // Best-effort audit AFTER the delete landed (a missing/foreign tag threw above — no phantom row).
    await ctx.audit({
      actorUserId: params.principal.userId,
      action: "tag.remove",
      entityType: "tag",
      entityId: params.tagId,
    });
    ctx.emitUserEvent(params.principal.userId, { type: "tagsChanged", tagId: params.tagId });
  };
}
