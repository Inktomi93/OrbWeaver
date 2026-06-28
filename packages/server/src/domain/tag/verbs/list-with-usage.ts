// verb: listTagsWithUsage — every owned tag + its five-junction usage rollup (the management screen read).

import type { ListTagsWithUsageParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { listOwnedTagsWithUsage } from "../persistence/queries";

export function createListWithUsage(ctx: TagContext): TagService["listTagsWithUsage"] {
  return (params: ListTagsWithUsageParams) =>
    listOwnedTagsWithUsage(ctx.db, params.principal.userId);
}
