// verb: setGlobalVariable — owner-scoped upsert of the per-user global plane, last-write-wins.
// Validates the caps BEFORE the write (empty/over-long key, over-64-KiB value, a NUL in either) for a typed
// refusal ahead of the DB CHECK; stamps the injected clock onto `updated_at` (overwriting the DDL default). A NUL
// is refused because the driver returns text cut at its first NUL, so it would read back as a different string.

import { containsNul, GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES, globalVariableKeySchema } from "@orb/contracts/automation";
import { GlobalVariableInvalidError } from "../contract/errors.ts";
import type { SetGlobalVariableParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { upsertGlobalVariable } from "../persistence/queries.ts";

export function createSetGlobalVariable(ctx: AutomationContext): AutomationService["setGlobalVariable"] {
  return async (params: SetGlobalVariableParams) => {
    const { key, value } = params;
    const parsedKey = globalVariableKeySchema.safeParse(key);
    if (!parsedKey.success) {
      if (key.length === 0) {
        throw new GlobalVariableInvalidError("global variable key must be non-empty");
      }
      if (key.length > GLOBAL_VARIABLE_KEY_MAX_CHARS) {
        throw new GlobalVariableInvalidError(`global variable key length ${key.length} exceeds the ${GLOBAL_VARIABLE_KEY_MAX_CHARS}-char cap`);
      }
      if (containsNul(key)) {
        throw new GlobalVariableInvalidError("global variable key must not contain a NUL character");
      }
      throw new GlobalVariableInvalidError("global variable key is invalid");
    }
    if (containsNul(value)) {
      throw new GlobalVariableInvalidError("global variable value must not contain a NUL character");
    }
    const valueBytes = Buffer.byteLength(value, "utf8");
    if (valueBytes > GLOBAL_VARIABLE_VALUE_MAX_BYTES) {
      throw new GlobalVariableInvalidError(`global variable value ${valueBytes} bytes exceeds the ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}-byte cap`);
    }
    await upsertGlobalVariable(ctx.db, { ownerId: params.principal.userId, key: parsedKey.data, value, updatedAt: ctx.now() });
  };
}
