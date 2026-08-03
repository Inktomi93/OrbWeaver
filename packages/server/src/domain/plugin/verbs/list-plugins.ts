// verb: listPlugins — the caller's OWN installed plugins (02 §4), newest-installed first (fetchOwned). No
// authority beyond ownership: the owner-scoped read is the gate (a foreign plugin is simply not in the result).

import type { ListPluginsParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { listOwned, toPluginView } from "../persistence/plugins.ts";

export function createListPlugins(ctx: PluginContext): PluginService["list"] {
  return async ({ caller }: ListPluginsParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    return rows.map(toPluginView);
  };
}
