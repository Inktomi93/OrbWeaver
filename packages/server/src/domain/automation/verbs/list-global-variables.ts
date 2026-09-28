// verb: listGlobalVariables — owner-scoped AutomationService wrapper over the persistence query.
// Key-sorted; `prefix` narrows the read. CEL and test-rule call that query directly.

import type { GlobalVariableView } from "@orb/contracts/automation";
import type { ListGlobalVariablesParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { listGlobalVariables } from "../persistence/queries.ts";

export function createListGlobalVariables(ctx: AutomationContext): AutomationService["listGlobalVariables"] {
  return (params: ListGlobalVariablesParams): Promise<GlobalVariableView[]> => listGlobalVariables(ctx.db, params.principal.userId, params.prefix);
}
