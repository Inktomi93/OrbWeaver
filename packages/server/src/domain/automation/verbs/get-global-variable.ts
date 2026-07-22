// verb: getGlobalVariable — owner-scoped read of the per-user global plane (02 §4). A foreign-owned or
// absent key reads as `null` (the owner predicate is in the query — a caller never learns another user's
// keys exist).

import type { GetGlobalVariableParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { selectGlobalVariable } from "../persistence/queries";

export function createGetGlobalVariable(ctx: AutomationContext): AutomationService["getGlobalVariable"] {
  return (params: GetGlobalVariableParams) => selectGlobalVariable(ctx.db, params.principal.userId, params.key);
}
