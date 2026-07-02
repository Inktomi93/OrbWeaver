// verb: pruneUnusedTags — delete the owner's zero-usage tags (no row in any of the five junctions); returns
// the removed count. A pending-suggestion junction row counts as usage (the rollup includes it) — a staged
// suggestion is a live reference, so it is NOT pruned.

import type { PruneUnusedTagsParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { pruneZeroUsageTags } from "../persistence/queries";

export function createPrune(ctx: TagContext): TagService["pruneUnusedTags"] {
  return async (params: PruneUnusedTagsParams) => {
    const removed = await pruneZeroUsageTags(ctx.db, params.principal.userId);
    // Best-effort audit only when something was actually pruned (a zero-work pass is a no-op — the
    // idempotent-no-op-writes-no-row posture; the bulk delete has no single entity id, count in metadata).
    if (removed > 0) {
      await ctx.audit({
        actorUserId: params.principal.userId,
        action: "tag.prune",
        entityType: "tag",
        entityId: null,
        metadata: { removed },
      });
    }
    return { removed };
  };
}
