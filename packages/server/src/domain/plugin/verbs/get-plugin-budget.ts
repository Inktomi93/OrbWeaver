// verb: getPluginBudget — read an OWNED plugin's per-day spend envelope (PLUGIN-SPEND). Owner-scoped exactly
// like getPluginLog: `getById(ownerId, pluginId)` gates first, so a foreign/missing id collapses leak-free to
// NOT_FOUND (no existence oracle) — a caller only ever reads THEIR OWN plugin's budget. An absent
// `plugin_budgets` row projects to the defaulted view (the values the spend gate stamps on insert), never
// invented ceilings.

import type { PluginBudgetView } from "@orb/contracts/plugin";
import { PluginNotFoundError } from "../contract/errors";
import type { GetPluginBudgetParams } from "../contract/params";
import type { PluginContext, PluginService } from "../contract/service";
import { selectBudgetView } from "../persistence/budgets";
import { getById } from "../persistence/plugins";

export function createGetPluginBudget(ctx: PluginContext): PluginService["getBudget"] {
  return async ({ caller, pluginId }: GetPluginBudgetParams): Promise<PluginBudgetView> => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return selectBudgetView(ctx.db, pluginId);
  };
}
