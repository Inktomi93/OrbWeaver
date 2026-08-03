// verb: mergeTags — fold sourceTagId into targetTagId, owner-scoped. Re-points every attachment across
// all five junctions to the target (character junction keeps the strongest status), then deletes the
// source tag in one atomic batch. A self-merge is a coded DomainOperationError, checked before the owner loads.

import { DomainOperationError } from "@orb/kit/errors";
import { TagNotFoundError } from "../contract/errors.ts";
import type { MergeTagsParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { loadOwnedTag, mergeTagBatch } from "../persistence/queries.ts";

export function createMerge(ctx: TagContext): TagService["mergeTags"] {
  return async (params: MergeTagsParams) => {
    const ownerId = params.principal.userId;
    if (params.sourceTagId === params.targetTagId) {
      throw new DomainOperationError("tag_merge_self", "a tag cannot be merged into itself");
    }
    const source = await loadOwnedTag(ctx.db, params.sourceTagId, ownerId);
    if (source === undefined) {
      throw new TagNotFoundError(params.sourceTagId);
    }
    const target = await loadOwnedTag(ctx.db, params.targetTagId, ownerId);
    if (target === undefined) {
      throw new TagNotFoundError(params.targetTagId);
    }
    await mergeTagBatch(ctx.db, ownerId, params.sourceTagId, params.targetTagId);
    await ctx.audit({
      actorUserId: ownerId,
      action: "tag.merge",
      entityType: "tag",
      entityId: params.sourceTagId,
      metadata: { into: params.targetTagId },
    });
    ctx.emitUserEvent(ownerId, { type: "tagsChanged" });
  };
}
