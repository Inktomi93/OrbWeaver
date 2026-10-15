// verb: listFires — a rule's recent fire log (host-only), newest first. The host's "why didn't my rule fire"
// debug surface (`outcome` + `detail`). Bounded by the indexed `(rule_id, fired_at)` read.

import type { FireView } from "@orb/contracts/automation";
import type { ListFiresParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { listFiresForRule } from "../persistence/fires.ts";

export function createListFires(ctx: AutomationContext): AutomationService["listFires"] {
  return async ({ principal, ruleId, limit }: ListFiresParams): Promise<FireView[]> => {
    await requireRuleAuthority(ctx, principal, ruleId);
    return listFiresForRule(ctx.db, ruleId, limit);
  };
}
