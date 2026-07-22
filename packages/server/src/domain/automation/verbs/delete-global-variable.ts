// verb: deleteGlobalVariable — owner-scoped removal of a per-user global (02 §4). Idempotent: deleting an
// absent (or foreign-owned) key is a no-op — the owner predicate is in the query.

import type { DeleteGlobalVariableParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { deleteGlobalVariable } from "../persistence/queries";

export function createDeleteGlobalVariable(ctx: AutomationContext): AutomationService["deleteGlobalVariable"] {
  return (params: DeleteGlobalVariableParams) => deleteGlobalVariable(ctx.db, params.principal.userId, params.key);
}
