// verb: listMacros — the caller's OWN enabled plugins' registered macros, the `listCommands` twin: `listOwned`
// scopes to the caller, and a disabled plugin has no resident instance. Names come from `pluginMacroName`.

import type { PluginMacroView } from "@orb/contracts/plugin";
import type { ListMacrosParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";
import { pluginMacroName } from "../substrate/plugin-macros.ts";

export function createListMacros(ctx: PluginContext, registry: PluginRegistry): PluginService["listMacros"] {
  return async ({ caller }: ListMacrosParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    const views: PluginMacroView[] = [];
    for (const row of rows) {
      const resident = registry.get(row.id);
      if (resident === undefined) {
        continue;
      }
      for (const macro of resident.instance.macros) {
        views.push({ pluginId: row.id, pluginName: row.name, name: pluginMacroName(row.slug, macro.name), description: macro.description });
      }
    }
    return views;
  };
}
