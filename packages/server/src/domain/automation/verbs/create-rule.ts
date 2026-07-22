// verb: createRule — host-authored rule creation (04 §2). Gates chat-host authority, validates the whole
// payload (trigger liveness · CEL parse · action shapes/caps/reserved-arm refusal · book attachment ·
// cooldown floor), assigns `position = max+1`, and inserts the rule BORN DISABLED (enabling is the consent
// act). Returns the stored view.

import type { CreateRuleParams } from "../contract/params";
import type { RuleView } from "../contract/results";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireChatHost } from "../guard";
import { insertRule, maxPosition, selectRuleRow, toRuleView } from "../persistence/rules";
import { RULE_MAX_FIRES_DEFAULT, validateRuleInput } from "../substrate/validate";

export function createCreateRule(ctx: AutomationContext): AutomationService["createRule"] {
  return async (params: CreateRuleParams): Promise<RuleView> => {
    await requireChatHost(ctx, params.principal, params.chatId);
    const cooldownSeconds = params.cooldownSeconds ?? 0;
    const maxFiresPerHour = params.maxFiresPerHour ?? RULE_MAX_FIRES_DEFAULT;
    const { actions } = await validateRuleInput(ctx.db, params.chatId, {
      trigger: params.trigger,
      predicateCel: params.predicateCel,
      actions: params.actions,
      cooldownSeconds,
      maxFiresPerHour,
    });
    const now = ctx.now();
    const id = ctx.newRuleId();
    const position = (await maxPosition(ctx.db, params.chatId)) + 1;
    await insertRule(ctx.db, {
      id,
      ownerId: params.principal.userId,
      chatId: params.chatId,
      name: params.name,
      description: params.description ?? null,
      position,
      triggerBus: params.trigger.bus,
      triggerType: params.trigger.type,
      predicateCel: params.predicateCel ?? null,
      actions,
      matchAutomationEvents: params.matchAutomationEvents ?? false,
      cooldownSeconds,
      maxFiresPerHour,
      createdAt: now,
      updatedAt: now,
    });
    // The row exists — it was just inserted in this transaction-less path (single-writer, no concurrent delete).
    const row = await selectRuleRow(ctx.db, id);
    if (row === undefined) {
      throw new Error(`createRule: row ${id} vanished immediately after insert`);
    }
    return toRuleView(row);
  };
}
