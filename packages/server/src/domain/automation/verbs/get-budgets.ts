// verb: getBudgets — read the per-chat budget panel (host-only). The A8 budget panel's read: the host-editable
// ceilings + the day spend accumulator, host-gated on the chat exactly like listRules/setBudgets. An absent
// `automation_budgets` row projects to the defaulted view (the values the write path stamps on insert / the
// dispatch gates use for a missing row) — never invented ceilings.

import type { BudgetView } from "@orb/contracts/automation";
import type { GetBudgetsParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireChatHost } from "../guard";
import { selectBudgetView } from "../persistence/budgets";

export function createGetBudgets(ctx: AutomationContext): AutomationService["getBudgets"] {
  return async ({ principal, chatId }: GetBudgetsParams): Promise<BudgetView> => {
    await requireChatHost(ctx, principal, chatId);
    return selectBudgetView(ctx.db, chatId);
  };
}
