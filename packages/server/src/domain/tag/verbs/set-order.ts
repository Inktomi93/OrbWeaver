// verb: setTagOrder — persist the manual tag order (position i → sortOrder i), owner-scoped, in ONE libSQL
// batch. The submitted ids must be a complete, duplicate-free permutation of the owner's current namespace;
// an empty namespace + empty input is the sole no-op arm. An id outside that namespace collapses to the same
// NOT_FOUND whether it belongs to another owner or does not exist; only all-owned permutation errors are 400s.

import { DomainOperationError } from "@orb/kit/errors";
import { TagNotFoundError } from "../contract/errors.ts";
import type { SetTagOrderParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { listOwnedTags, setTagOrderBatch } from "../persistence/queries.ts";

export function createSetOrder(ctx: TagContext): TagService["setTagOrder"] {
  return async (params: SetTagOrderParams) => {
    const ownedIds = (await listOwnedTags(ctx.db, params.principal.userId)).map((tag) => tag.id);
    if (ownedIds.length === 0 && params.orderedIds.length === 0) {
      return;
    }
    const owned = new Set(ownedIds);
    const unownedId = params.orderedIds.find((id) => !owned.has(id));
    if (unownedId !== undefined) {
      throw new TagNotFoundError(unownedId);
    }
    const submitted = new Set(params.orderedIds);
    if (submitted.size !== params.orderedIds.length || submitted.size !== ownedIds.length || ownedIds.some((id) => !submitted.has(id))) {
      throw new DomainOperationError("tag_order_not_permutation", "tag order must contain every owned tag exactly once");
    }
    await setTagOrderBatch(ctx.db, params.principal.userId, params.orderedIds);
    ctx.emitUserEvent(params.principal.userId, { type: "tagsChanged" });
  };
}
