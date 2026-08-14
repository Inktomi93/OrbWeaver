// verb: deleteRule — remove a rule (host-only). The fire-log rows CASCADE with the rule (FK). Idempotent
// only insofar as the guard first proves the rule exists + the caller hosts its chat (a leak-free NOT_FOUND
// otherwise).

import type { DeleteRuleParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleHost } from "../guard.ts";
import { deleteRuleRow } from "../persistence/rules.ts";

export function createDeleteRule(ctx: AutomationContext): AutomationService["deleteRule"] {
  return async ({ principal, ruleId }: DeleteRuleParams): Promise<void> => {
    const rule = await requireRuleHost(ctx, principal, ruleId);
    await deleteRuleRow(ctx.db, ruleId);
    // Deleting an enabled rule can empty a chat's rule set (or the last domain rule) — refresh the pre-check.
    await ctx.enabled.reload();
    // Deleting an enabled transform_draft rule must deregister its pipeline transform (A7).
    await ctx.transforms.reload();
    // The roster announces itself (survey H2/F5). D50 rules out per-entity DELETION events, and this is not
    // one: `rulesChanged` is the coarse "this chat's rule set moved" member — the same event a create sends.
    // `chatId` is read off the guard-loaded row BEFORE the delete; the row is gone by the time this fires.
    ctx.notify({ type: "rulesChanged", chatId: rule.chatId });
  };
}
