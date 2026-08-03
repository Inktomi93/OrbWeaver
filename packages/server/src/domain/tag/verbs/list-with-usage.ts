// verb: listTagsWithUsage — every owned tag + its five-junction usage rollup (the management screen read).

import type { ListTagsWithUsageParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { listOwnedTagsWithUsage } from "../persistence/queries.ts";

export function createListWithUsage(ctx: TagContext): TagService["listTagsWithUsage"] {
  return (params: ListTagsWithUsageParams) => listOwnedTagsWithUsage(ctx.db, params.principal.userId);
}
