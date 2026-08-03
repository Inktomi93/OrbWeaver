// verb: setBudgets — upsert the per-chat fire-rate cap (host-only; the loop-safety belt). The row is born on
// the first set; an absent field keeps its current value / DB default.

import type { SetBudgetsParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { upsertBudget } from "../persistence/budgets.ts";

export function createSetBudgets(ctx: AutomationContext): AutomationService["setBudgets"] {
  return async ({ principal, chatId, maxFiresPerHour }: SetBudgetsParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await upsertBudget(ctx.db, chatId, { maxFiresPerHour }, ctx.now());
  };
}
