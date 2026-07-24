// verb: setBudgets — upsert the per-chat fire-rate cap (host-only; the loop-safety belt). The row is born on
// the first set; an absent field keeps its current value / DB default.

import type { SetBudgetsParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireChatHost } from "../guard";
import { upsertBudget } from "../persistence/budgets";

export function createSetBudgets(ctx: AutomationContext): AutomationService["setBudgets"] {
  return async ({ principal, chatId, maxFiresPerHour }: SetBudgetsParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await upsertBudget(ctx.db, chatId, { maxFiresPerHour }, ctx.now());
  };
}
