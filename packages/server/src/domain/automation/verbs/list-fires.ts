// verb: listFires — a rule's recent fire log (host-only), newest first. The host's "why didn't my rule fire"
// debug surface (`outcome` + `detail`). Bounded by the indexed `(rule_id, fired_at)` read.

import type { ListFiresParams } from "../contract/params";
import type { FireView } from "../contract/results";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireRuleHost } from "../guard";
import { listFiresForRule } from "../persistence/fires";

export function createListFires(ctx: AutomationContext): AutomationService["listFires"] {
  return async ({ principal, ruleId, limit }: ListFiresParams): Promise<FireView[]> => {
    await requireRuleHost(ctx, principal, ruleId);
    return listFiresForRule(ctx.db, ruleId, limit);
  };
}
