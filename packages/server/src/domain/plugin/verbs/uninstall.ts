// verb: uninstall — remove an installed plugin (02 §4). Authority = install authority (owner ∪ admin). Order:
// deactivate (dispose the resident instance + deregister its tools/transforms/subs — no ghost registrations,
// 03 §5) → delete the row (`plugin_kv` CASCADEs off the FK) → reap the now-unreferenced bundle asset. The
// bundle FK is ON DELETE RESTRICT, so the row MUST go before the asset can be reaped (`reapIfOrphan` re-checks
// references — a within-user dedup that shares the asset with another plugin is never reaped, 02 §3).

import { PluginNotFoundError } from "../contract/errors.ts";
import type { UninstallPluginParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { deletePlugin, getById } from "../persistence/plugins.ts";

export function createUninstall(ctx: PluginContext, deps: Pick<ActivationDeps, "deactivate">): PluginService["uninstall"] {
  return async ({ caller, pluginId }: UninstallPluginParams): Promise<void> => {
    ctx.can(caller, "admin", { kind: "global" });

    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    deps.deactivate(pluginId);
    await deletePlugin(ctx.db, pluginId);
    await ctx.assets.reapOrphans([existing.bundleAssetId]);
  };
}
