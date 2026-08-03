// verb: listTags — the owner's full tag collection (ordered: manual sort first, then name fallback).

import type { ListTagsParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { listOwnedTags, toTagView } from "../persistence/queries.ts";

export function createList(ctx: TagContext): TagService["listTags"] {
  return async (params: ListTagsParams) => {
    const rows = await listOwnedTags(ctx.db, params.principal.userId);
    return rows.map(toTagView);
  };
}
