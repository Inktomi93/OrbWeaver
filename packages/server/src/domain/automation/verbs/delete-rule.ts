// verb: deleteRule — remove a rule (host-only). The fire-log rows CASCADE with the rule (FK). Idempotent
// only insofar as the guard first proves the rule exists + the caller hosts its chat (a leak-free NOT_FOUND
// otherwise).

import type { DeleteRuleParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { deleteRuleRow } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";

export function createDeleteRule(ctx: AutomationContext): AutomationService["deleteRule"] {
  return async ({ principal, ruleId }: DeleteRuleParams): Promise<void> => {
    const rule = await requireRuleAuthority(ctx, principal, ruleId);
    await deleteRuleRow(ctx.db, ruleId);
    // S4 — the rule is gone, so its pending asks are unanswerable (the confirm's own re-check would refuse
    // them); drop them with it. The in-RAM store has no FK to cascade for it.
    ctx.suggestions.voidRule(ruleId);
    // Deleting an enabled rule can empty a chat's rule set (or the last domain rule) — refresh the pre-check.
    // `refresh`, not `reload` (#1431): the DELETE is already committed, so an index failure must not reject an
    // operation that SUCCEEDED — it latches stale (reads fail OPEN, so canon decides) and the watcher front
    // door rebuilds on the next event. The alternative shipped the worst pair: a caller told the delete
    // failed, and an index that keeps dispatching the deleted rule.
    await ctx.enabled.refresh();
    // Deleting an enabled transform_draft rule must deregister its pipeline transform.
    await ctx.transforms.refresh();
    // The roster announces itself (survey H2/F5). D50 rules out per-entity DELETION events, and this is not
    // one: `rulesChanged` is the coarse "this chat's rule set moved" member — the same event a create sends.
    // `chatId` is read off the guard-loaded row BEFORE the delete; the row is gone by the time this fires.
    notifyRulesChanged(ctx, rule.chatId);
  };
}
