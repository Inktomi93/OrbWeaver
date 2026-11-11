// verb: setGlobalVariable — owner-scoped upsert of the per-user global plane, last-write-wins. The key and value
// checks (empty/over-long key, over-64-KiB value, a NUL in either) are the plane's write guard in
// `persistence/queries.ts`, which every writer reaches; a refusal is a typed `GlobalVariableInvalidError` ahead of
// the DB CHECK. Stamps the injected clock onto `updated_at` (overwriting the DDL default).

import type { SetGlobalVariableParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { upsertGlobalVariable } from "../persistence/queries.ts";

export function createSetGlobalVariable(ctx: AutomationContext): AutomationService["setGlobalVariable"] {
  return async (params: SetGlobalVariableParams) => {
    await upsertGlobalVariable(ctx.db, { ownerId: params.principal.userId, key: params.key, value: params.value, updatedAt: ctx.now() });
  };
}
