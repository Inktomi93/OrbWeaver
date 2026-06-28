// verb: getTag — owner-scoped single fetch. A foreign-owned (or missing) id throws `TagNotFoundError`
// (the owner predicate is in the query — a non-owner never learns the row exists).

import { TagNotFoundError } from "../contract/errors";
import type { GetTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { loadOwnedTag, toTagView } from "../persistence/queries";

export function createGet(ctx: TagContext): TagService["getTag"] {
  return async (params: GetTagParams) => {
    const row = await loadOwnedTag(ctx.db, params.tagId, params.principal.userId);
    if (row === undefined) {
      throw new TagNotFoundError(params.tagId);
    }
    return toTagView(row);
  };
}
