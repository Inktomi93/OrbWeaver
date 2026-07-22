// verb: setPluginBudget — upsert an OWNED plugin's per-day spend ceilings (PLUGIN-SPEND). Owner-scoped exactly
// like getPluginBudget: `getById(ownerId, pluginId)` gates first (a foreign/missing id ⇒ leak-free NOT_FOUND),
// so a caller only edits THEIR OWN plugin's budget. The row is born on the first set; absent fields keep the
// current value / DB default, and a `null` clears that ceiling (no cap). The spend accumulator columns are the
// gate's (never touched here — the host-edits-ceilings / gate-writes-accumulators split).

import { PluginNotFoundError } from "../contract/errors";
import type { SetPluginBudgetParams } from "../contract/params";
import type { PluginContext, PluginService } from "../contract/service";
import { upsertBudget } from "../persistence/budgets";
import { getById } from "../persistence/plugins";

export function createSetPluginBudget(ctx: PluginContext): PluginService["setBudget"] {
  return async ({ caller, pluginId, maxActionsPerDay, maxUsdPerDay }: SetPluginBudgetParams): Promise<void> => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    await upsertBudget(ctx.db, pluginId, { maxActionsPerDay, maxUsdPerDay }, ctx.now());
  };
}
