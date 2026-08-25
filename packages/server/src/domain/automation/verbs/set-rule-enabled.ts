// verb: setRuleEnabled — enable/disable a rule (host-only). Enabling is the consent act (rules are born
// disabled). This flip is the primary maintainer of the watcher's in-process enabled index: after the
// write, reload the index so the pre-check sees the new enablement immediately.

import type { SetRuleEnabledParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { setRuleEnabledRow } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";

export function createSetRuleEnabled(ctx: AutomationContext): AutomationService["setRuleEnabled"] {
  return async ({ principal, ruleId, enabled }: SetRuleEnabledParams): Promise<void> => {
    const rule = await requireRuleAuthority(ctx, principal, ruleId);
    await setRuleEnabledRow(ctx.db, ruleId, enabled, ctx.now());
    if (!enabled) {
      // S4 — withdrawing consent VOIDS this rule's pending asks. Leaving them would offer a host a card
      // whose confirm the re-check now refuses; the honest surface is no card at all.
      ctx.suggestions.voidRule(ruleId);
    }
    await ctx.enabled.reload();
    // A transform_draft rule's registration into the turn pipeline follows enablement — reconcile it.
    await ctx.transforms.reload();
    // Enablement is the CONSENT act, so it is the one rule write a second host tab most needs announced
    // (survey H2/F5). Emitted after both indexes reconcile — a re-read on this event sees the settled state.
    notifyRulesChanged(ctx, rule.chatId);
  };
}
