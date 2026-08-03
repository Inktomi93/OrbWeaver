// verb: listGlobalVariables — owner-scoped enumeration of the per-user global plane (02 §4), the
// settings-page surface. Key-sorted; `prefix` narrows the read. Only ever the caller's own globals.

import type { GlobalVariableView } from "@orb/contracts/automation";
import type { ListGlobalVariablesParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { listGlobalVariables } from "../persistence/queries.ts";

export function createListGlobalVariables(ctx: AutomationContext): AutomationService["listGlobalVariables"] {
  return (params: ListGlobalVariablesParams): Promise<GlobalVariableView[]> => listGlobalVariables(ctx.db, params.principal.userId, params.prefix);
}
