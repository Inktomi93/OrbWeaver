// verb: deleteRule — remove a rule (host-only). The fire-log rows CASCADE with the rule (FK). Idempotent
// only insofar as the guard first proves the rule exists + the caller hosts its chat (a leak-free NOT_FOUND
// otherwise).

import type { DeleteRuleParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireRuleHost } from "../guard";
import { deleteRuleRow } from "../persistence/rules";

export function createDeleteRule(ctx: AutomationContext): AutomationService["deleteRule"] {
  return async ({ principal, ruleId }: DeleteRuleParams): Promise<void> => {
    await requireRuleHost(ctx, principal, ruleId);
    await deleteRuleRow(ctx.db, ruleId);
    // Deleting an enabled rule can empty a chat's rule set (or the last domain rule) — refresh the pre-check.
    await ctx.enabled.reload();
    // Deleting an enabled transform_draft rule must deregister its pipeline transform (A7).
    await ctx.transforms.reload();
  };
}
