// verb: setRuleSuggestOnRefusal — RULED F4's PER-RULE OPT-OUT (row B4, the one
// B-series arm that shipped after the rest). Flips whether a RATE REFUSAL of this rule still offers the host
// the "run it now?" invitation. Host-only, via the same `requireRuleAuthority` chokepoint every rule-scoped
// verb takes (a stranger collapses to a leak-free NOT_FOUND before the write).
//
// WHY A VERB OF ITS OWN, and not a field on the create/update PUT: `updateRule` is a REPLACE that always
// NULLS `rule_preset_id`/`rule_preset_knobs` (the B10 mint-provenance biconditional — a hand-edited rule is
// no longer the preset's mint). A host toggling a notification preference has not hand-edited anything, and
// making them pay for it with their saved-cast lineage would be a defect the wire shape invited. `enabled`
// already sits in exactly this class — operational state, its own targeted flip, outside the PUT — and this
// knob is its sibling.
//
// NO INDEX RELOAD, deliberately: the enabled index and the prompt-transform index key off ENABLEMENT and
// TRIGGER, neither of which moves here. The dispatch reads `suggest_on_refusal` straight off the rule ROW it
// already loaded per fire, so the flip is live on the very next event with nothing to reconcile.
//
// NO PENDING-ASK VOID, also deliberately: turning the offer off says "stop asking me", not "the ask you
// already raised was never authorized" (which is what `setRuleEnabled(false)` says, and why THAT one voids).
// An invitation already on screen is a live, still-confirmable offer whose re-check would still pass; yanking
// it out from under a host mid-decision would be the surprise, not the courtesy.

import type { SetRuleSuggestOnRefusalParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { setRuleSuggestOnRefusalRow } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";

export function createSetRuleSuggestOnRefusal(ctx: AutomationContext): AutomationService["setRuleSuggestOnRefusal"] {
  return async ({ principal, ruleId, suggestOnRefusal }: SetRuleSuggestOnRefusalParams): Promise<void> => {
    const rule = await requireRuleAuthority(ctx, principal, ruleId);
    await setRuleSuggestOnRefusalRow(ctx.db, ruleId, suggestOnRefusal, ctx.now());
    // A second host tab renders this rule's own toggle, so the flip is announced on the same rules-changed
    // event the enable flip rides (a chat-less rule reaches no live feed — `substrate/rule-feed.ts`).
    notifyRulesChanged(ctx, rule.chatId);
  };
}
