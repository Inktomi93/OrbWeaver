// verb: listMacros — the caller's OWN enabled plugins' registered MACROS, the `listCommands` twin: `listOwned`
// filters `WHERE owner_id = caller.userId`, so a macro reaches the result only if the caller owns the plugin, and
// a disabled or errored plugin has no resident instance and contributes nothing.
// The name is the host-namespaced spelling an author types (`pluginMacroName`, the one mint), never a client
// re-derivation.

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
