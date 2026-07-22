// verb: testRule — the dry-run (host-only, 04 §2). Builds a TriggerFact from a host-supplied sample (or a
// synthesized minimal fact from the rule's trigger), evaluates the predicate, and MACRO-RENDERS every arm's
// template — executing NOTHING (no injected op, no budget debit). Logs an `outcome:"test_run"` fire row for
// provenance. The dry-run env has the author's own globals (automation owns the plane) + a chat message
// count; live chat vars/choice are empty in A4 (the dispatch threads them in A5).

import type { TestRuleParams } from "../contract/params";
import type { TestRunResult } from "../contract/results";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireRuleHost } from "../guard";
import { countChatMessages } from "../persistence/canon-reads";
import { insertFire } from "../persistence/fires";
import { listGlobalVariables } from "../persistence/queries";
import { toRuleView } from "../persistence/rules";
import { emptyDryRunEnv, evaluatePredicate, renderArmPreview, synthFact } from "../substrate/dry-run";

export function createTestRule(ctx: AutomationContext): AutomationService["testRule"] {
  return async ({ principal, ruleId, sampleEvent }: TestRuleParams): Promise<TestRunResult> => {
    const rule = await requireRuleHost(ctx, principal, ruleId);
    const view = toRuleView(rule);
    const nowMs = ctx.now();
    const [messageCount, globalViews] = await Promise.all([countChatMessages(ctx.db, rule.chatId), listGlobalVariables(ctx.db, principal.userId)]);
    const global = Object.fromEntries(globalViews.map((v) => [v.key, v.value]));
    const event = sampleEvent ?? synthFact(view.trigger, rule.chatId);
    const env = emptyDryRunEnv({ chatId: rule.chatId, messageCount, global, event, nowMs });

    const predicate = evaluatePredicate(view.predicateCel, env);
    const arms = view.actions.map((action) => renderArmPreview(action, env, nowMs, ctx.prng));

    await insertFire(ctx.db, {
      id: ctx.newFireId(),
      ruleId,
      chatId: rule.chatId,
      triggerType: view.trigger.type,
      outcome: "test_run",
      detail: { predicate, arms },
      automationDepth: 0,
      firedAt: nowMs,
    });
    return { predicate, arms };
  };
}
