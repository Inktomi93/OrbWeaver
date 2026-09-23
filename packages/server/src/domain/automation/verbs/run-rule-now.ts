// verb: runRuleNow — R7. The host runs ONE rule NOW: a single fresh
// dispatch at cascade depth 0, host-gated on the rule's own chat. Three callers by design: the S4
// invitation's confirm (a rate-capped spend rule the host chose to run anyway), B2's "Run now" action beside
// the fire log, and on-demand analysis when C1 lands.
//
// IT IS NOT `testRule`, AND `testRule` IS NOT CHANGED. The dry-run executes NOTHING — no op, no budget, no
// write — and that is a deliberate, kept property: an author debugging a predicate must be able to press a
// button that cannot spend money or post a turn. This verb is the OTHER half of that pair, and the two stay
// separate verbs precisely so neither can drift into the other.
//
// The rule must be ENABLED. A disabled rule is one the host has withdrawn consent from; "run it now" is not
// a back door around that, it is a request to run a rule that is already live.

import { RuleValidationError } from "../contract/errors.ts";
import type { RunRuleNowParams } from "../contract/params.ts";
import type { RunRuleNowResult } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { dispatchRuleNow } from "../substrate/run-now.ts";

export function createRunRuleNow(ctx: AutomationContext): AutomationService["runRuleNow"] {
  return async ({ principal, ruleId }: RunRuleNowParams): Promise<RunRuleNowResult> => {
    const rule = await requireRuleAuthority(ctx, principal, ruleId);
    if (!rule.enabled) {
      throw new RuleValidationError("rule_disabled", "this rule is disabled — enable it before running it");
    }
    const outcome = await dispatchRuleNow(ctx, rule, rule.chatId, principal.userId);
    if (outcome === null) {
      // The one reachable null for an enabled rule of either scope: a transform_draft rule, which rewrites a
      // draft INSIDE the turn pipeline and has no out-of-turn meaning at all. (An owner-global rule cannot
      // carry that arm — `AUTOMATION_ARM_SCOPE` marks it chat-required — so this branch is a chat rule's.)
      throw new RuleValidationError(
        "transform_not_runnable",
        "a transform_draft rule runs inside the turn pipeline — there is no draft to rewrite out of turn",
      );
    }
    return { outcome };
  };
}
