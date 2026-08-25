// verb: listOwnerRules — the caller's OWN owner-global rules, in position order (C5). The Automation
// settings pane's read, and the chat-less twin of `listRules`.
//
// IT TAKES NO ID AND HAS NO GUARD, and that is the D18 single-owned posture rather than a missing check: the
// scope IS `principal.userId`, so there is no way to ask for someone else's lane and therefore nothing for a
// gate to refuse. `listGlobalVariables` reads its plane the same way, for the same reason. The moment this
// verb grew an `ownerId` PARAMETER it would need one — which is precisely why it does not have one.

import type { ListOwnerRulesParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { listRuleRowsForOwnerGlobal, toRuleView } from "../persistence/rules.ts";

export function createListOwnerRules(ctx: AutomationContext): AutomationService["listOwnerRules"] {
  return async ({ principal }: ListOwnerRulesParams): Promise<RuleView[]> => {
    const rows = await listRuleRowsForOwnerGlobal(ctx.db, principal.userId);
    return rows.map(toRuleView);
  };
}
