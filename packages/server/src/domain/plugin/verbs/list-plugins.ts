// verb: listPlugins — the caller's OWN installed plugins (02 §4), newest-installed first (fetchOwned). No
// authority beyond ownership: the owner-scoped read is the gate (a foreign plugin is simply not in the result).

import type { ListPluginsParams } from "../contract/params";
import type { PluginContext, PluginService } from "../contract/service";
import { selectBudgetView } from "../persistence/budgets";
import { listOwned, toPluginView } from "../persistence/plugins";

export function createListPlugins(ctx: PluginContext): PluginService["list"] {
  return async ({ caller }: ListPluginsParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    // Each row carries its per-day spend envelope (PLUGIN-SPEND) — an absent budget row projects to the
    // defaulted view (the panel renders limit + spent-today for both ceilings). Per-row read: a user's plugin
    // count is tiny (single-owner, hand-installed), so N+1 here is fine (the automation getBudgets precedent).
    return Promise.all(rows.map(async (row) => toPluginView(row, await selectBudgetView(ctx.db, row.id))));
  };
}
