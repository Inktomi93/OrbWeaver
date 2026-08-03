// verb: setRuleEnabled — enable/disable a rule (host-only). Enabling is the consent act (rules are born
// disabled). This flip is the primary maintainer of the watcher's in-process enabled index (01 §3): after the
// write, reload the index so the pre-check sees the new enablement immediately.

import type { SetRuleEnabledParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleHost } from "../guard.ts";
import { setRuleEnabledRow } from "../persistence/rules.ts";

export function createSetRuleEnabled(ctx: AutomationContext): AutomationService["setRuleEnabled"] {
  return async ({ principal, ruleId, enabled }: SetRuleEnabledParams): Promise<void> => {
    await requireRuleHost(ctx, principal, ruleId);
    await setRuleEnabledRow(ctx.db, ruleId, enabled, ctx.now());
    await ctx.enabled.reload();
    // A transform_draft rule's registration into the turn pipeline (A7) follows enablement — reconcile it.
    await ctx.transforms.reload();
  };
}
