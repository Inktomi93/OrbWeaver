// verb: getBudgets — read the per-chat fire-rate cap (host-only). The A8 panel's read: the host-editable
// fire-rate ceiling, host-gated on the chat exactly like listRules/setBudgets. An absent `automation_budgets`
// row projects to the defaulted view (the value the write path stamps on insert / the rate gate uses for a
// missing row) — never an invented ceiling.

import type { BudgetView } from "@orb/contracts/automation";
import type { GetBudgetsParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { selectBudgetView } from "../persistence/budgets.ts";

export function createGetBudgets(ctx: AutomationContext): AutomationService["getBudgets"] {
  return async ({ principal, chatId }: GetBudgetsParams): Promise<BudgetView> => {
    await requireChatHost(ctx, principal, chatId);
    return selectBudgetView(ctx.db, chatId);
  };
}
