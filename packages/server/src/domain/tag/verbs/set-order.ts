// verb: setTagOrder — persist the manual tag order (position i → sortOrder i), owner-scoped, in ONE libSQL
// batch. The transport enforces `min(1)`; the verb guards the empty case (an empty batch is rejected by
// libSQL) by no-op'ing.

import type { SetTagOrderParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { setTagOrderBatch } from "../persistence/queries";

export function createSetOrder(ctx: TagContext): TagService["setTagOrder"] {
  return async (params: SetTagOrderParams) => {
    if (params.orderedIds.length === 0) {
      return;
    }
    await setTagOrderBatch(ctx.db, params.principal.userId, params.orderedIds);
  };
}
