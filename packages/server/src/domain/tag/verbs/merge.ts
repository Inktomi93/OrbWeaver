// verb: mergeTags — fold `sourceTagId` INTO `targetTagId`, owner-scoped. Re-points every attachment across
// all five junctions to the target (deduping where the target already tags that entity; the character
// junction keeps the STRONGEST status — accepted over pending), then deletes the source tag, in ONE atomic
// libSQL batch (mergeTagBatch). Both ids must be the principal's — a foreign/missing tag reads as
// TagNotFoundError (owner-scoped). A self-merge (equal ids) is a coded DomainOperationError (a nonsensical
// op, not a silent no-op) — checked BEFORE the owner loads so a `source === target` call fails fast.

import { DomainOperationError } from "@orb/kit/errors";
import { TagNotFoundError } from "../contract/errors";
import type { MergeTagsParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { loadOwnedTag, mergeTagBatch } from "../persistence/queries";

export function createMerge(ctx: TagContext): TagService["mergeTags"] {
  return async (params: MergeTagsParams) => {
    const ownerId = params.principal.userId;
    if (params.sourceTagId === params.targetTagId) {
      throw new DomainOperationError("tag_merge_self", "a tag cannot be merged into itself");
    }
    // Both endpoints must be owner-owned — a foreign/missing tag reads as not-found (owner-scoped).
    const source = await loadOwnedTag(ctx.db, params.sourceTagId, ownerId);
    if (source === undefined) {
      throw new TagNotFoundError(params.sourceTagId);
    }
    const target = await loadOwnedTag(ctx.db, params.targetTagId, ownerId);
    if (target === undefined) {
      throw new TagNotFoundError(params.targetTagId);
    }
    await mergeTagBatch(ctx.db, ownerId, params.sourceTagId, params.targetTagId);
    // Best-effort audit AFTER the merge landed (a foreign/self merge threw above — no phantom row).
    await ctx.audit({
      actorUserId: ownerId,
      action: "tag.merge",
      entityType: "tag",
      entityId: params.sourceTagId,
      metadata: { into: params.targetTagId },
    });
    // Both the source (gone) and target (grown) tags changed — path-invalidate the whole tag surface.
    ctx.emitUserEvent(ownerId, { type: "tagsChanged" });
  };
}
