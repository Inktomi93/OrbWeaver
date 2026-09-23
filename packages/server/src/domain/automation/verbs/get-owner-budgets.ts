// verb: getOwnerBudgets — read the caller's OWN owner-global fire-rate ceiling (C5), the belt every
// chat-less rule of theirs counts against.
//
// NO GUARD, and that is the D18 single-owned posture rather than a missing check (`verbs/list-owner-rules.ts`
// states it in full): the row's key IS `principal.userId`, so there is no way to name another user's ceiling
// and nothing for a gate to refuse. An ABSENT row projects to the DDL default, so a caller who has never set
// a ceiling still sees the one they are actually dispatched under.

import type { OwnerBudgetView } from "@orb/contracts/automation";
import type { GetOwnerBudgetsParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { selectOwnerBudgetView } from "../persistence/budgets.ts";

export function createGetOwnerBudgets(ctx: AutomationContext): AutomationService["getOwnerBudgets"] {
  return ({ principal }: GetOwnerBudgetsParams): Promise<OwnerBudgetView> => selectOwnerBudgetView(ctx.db, principal.userId);
}
