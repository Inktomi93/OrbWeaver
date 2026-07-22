// verb: updateRule — replace a rule's editable fields (host-only, 04 §2). Same validation as createRule;
// resets the error ledger (`consecutive_errors`/`last_error` — a fresh authoring pass clears the auto-
// disable countdown). The chat/owner/position/enabled state is immutable here (enable is its own verb;
// reorder is its own verb). Returns the stored view.

import type { UpdateRuleParams } from "../contract/params";
import type { RuleView } from "../contract/results";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireRuleHost } from "../guard";
import { applyRuleUpdate, selectRuleRow, toRuleView } from "../persistence/rules";
import { RULE_MAX_FIRES_DEFAULT, validateRuleInput } from "../substrate/validate";

export function createUpdateRule(ctx: AutomationContext): AutomationService["updateRule"] {
  return async (params: UpdateRuleParams): Promise<RuleView> => {
    const rule = await requireRuleHost(ctx, params.principal, params.ruleId);
    const cooldownSeconds = params.cooldownSeconds ?? 0;
    const maxFiresPerHour = params.maxFiresPerHour ?? RULE_MAX_FIRES_DEFAULT;
    const { actions } = await validateRuleInput(ctx.db, rule.chatId, {
      trigger: params.trigger,
      predicateCel: params.predicateCel,
      actions: params.actions,
      cooldownSeconds,
      maxFiresPerHour,
    });
    await applyRuleUpdate(ctx.db, params.ruleId, {
      name: params.name,
      description: params.description ?? null,
      triggerBus: params.trigger.bus,
      triggerType: params.trigger.type,
      predicateCel: params.predicateCel ?? null,
      actions,
      matchAutomationEvents: params.matchAutomationEvents ?? false,
      cooldownSeconds,
      maxFiresPerHour,
      updatedAt: ctx.now(),
    });
    const row = await selectRuleRow(ctx.db, params.ruleId);
    if (row === undefined) {
      throw new Error(`updateRule: row ${params.ruleId} vanished immediately after update`);
    }
    // An enabled rule's trigger BUS can change (chat↔domain) — refresh the pre-check's domain-rule flag.
    await ctx.enabled.reload();
    // A rule edit can add/remove transform_draft arms or change their target/template/predicate/order (A7).
    await ctx.transforms.reload();
    return toRuleView(row);
  };
}
