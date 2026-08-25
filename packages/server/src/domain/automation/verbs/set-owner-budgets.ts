// verb: setOwnerBudgets — upsert the caller's OWN owner-global fire-rate ceiling (C5), the chat-less twin of
// `setBudgets`. The row is born on the first set; an absent field keeps its current value / DB default.
//
// NO GUARD, the D18 single-owned posture (`verbs/list-owner-rules.ts` states it in full): the row's key IS
// `principal.userId`, so there is no other lane a caller could write.

import type { SetOwnerBudgetsParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { upsertOwnerBudget } from "../persistence/budgets.ts";

export function createSetOwnerBudgets(ctx: AutomationContext): AutomationService["setOwnerBudgets"] {
  return async ({ principal, maxFiresPerHour }: SetOwnerBudgetsParams): Promise<void> => {
    await upsertOwnerBudget(ctx.db, principal.userId, { maxFiresPerHour }, ctx.now());
  };
}
