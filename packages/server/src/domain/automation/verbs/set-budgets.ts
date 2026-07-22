// verb: setBudgets — upsert the per-chat budget row (host-only, 03 §3). The row is born on the first set;
// absent fields keep their current value / DB default, and `maxUsdPerDay: null` clears the dollar ceiling.
// The spend accumulator columns are the dispatch engine's (A5) — never touched here.

import type { SetBudgetsParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireChatHost } from "../guard";
import { upsertBudget } from "../persistence/budgets";

export function createSetBudgets(ctx: AutomationContext): AutomationService["setBudgets"] {
  return async ({ principal, chatId, maxFiresPerHour, maxSpendActionsPerDay, maxUsdPerDay }: SetBudgetsParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await upsertBudget(ctx.db, chatId, { maxFiresPerHour, maxSpendActionsPerDay, maxUsdPerDay }, ctx.now());
  };
}
