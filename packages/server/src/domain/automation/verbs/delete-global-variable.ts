// verb: deleteGlobalVariable — owner-scoped removal of a per-user global. Idempotent: deleting an
// absent (or foreign-owned) key is a no-op — the owner predicate is in the query.

import type { DeleteGlobalVariableParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { deleteGlobalVariable } from "../persistence/queries.ts";

export function createDeleteGlobalVariable(ctx: AutomationContext): AutomationService["deleteGlobalVariable"] {
  return (params: DeleteGlobalVariableParams) => deleteGlobalVariable(ctx.db, params.principal.userId, params.key);
}
