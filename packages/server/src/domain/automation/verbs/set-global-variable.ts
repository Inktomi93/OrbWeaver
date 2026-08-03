// verb: setGlobalVariable — owner-scoped upsert of the per-user global plane (02 §4), last-write-wins.
// Validates the caps BEFORE the write (empty/over-long key, over-64-KiB value) for a typed refusal ahead
// of the DB CHECK; stamps the injected clock onto `updated_at` (overwriting the DDL default).

import { GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES } from "@orb/contracts/automation";
import { GlobalVariableInvalidError } from "../contract/errors.ts";
import type { SetGlobalVariableParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { upsertGlobalVariable } from "../persistence/queries.ts";

export function createSetGlobalVariable(ctx: AutomationContext): AutomationService["setGlobalVariable"] {
  return async (params: SetGlobalVariableParams) => {
    const { key, value } = params;
    if (key.length === 0) {
      throw new GlobalVariableInvalidError("global variable key must be non-empty");
    }
    if (key.length > GLOBAL_VARIABLE_KEY_MAX_CHARS) {
      throw new GlobalVariableInvalidError(`global variable key length ${key.length} exceeds the ${GLOBAL_VARIABLE_KEY_MAX_CHARS}-char cap`);
    }
    const valueBytes = Buffer.byteLength(value, "utf8");
    if (valueBytes > GLOBAL_VARIABLE_VALUE_MAX_BYTES) {
      throw new GlobalVariableInvalidError(`global variable value ${valueBytes} bytes exceeds the ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}-byte cap`);
    }
    await upsertGlobalVariable(ctx.db, { ownerId: params.principal.userId, key, value, updatedAt: ctx.now() });
  };
}
