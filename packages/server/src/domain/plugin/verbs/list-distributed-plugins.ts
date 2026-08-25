// verb: listDistributedPlugins — the published set (D147 clause (d)), for the admin's distribute surface.
// ADMIN-gated: this is DEPLOYMENT POLICY, not a per-user read. A member does not need it — their own copies
// already arrive through `list`, and what the server publishes is not a fact any control on their pane acts on.
// The read itself is unscoped by construction (a distribution has no owner); `requireAdmin` is the whole gate.

import type { ListDistributedPluginsParams } from "../contract/params.ts";
import type { PluginContext, PluginDistributionDeps, PluginService } from "../contract/service.ts";
import { listDistributions, toDistributedPluginView } from "../persistence/distributed-plugins.ts";

export function createListDistributedPlugins(ctx: PluginContext, deps: PluginDistributionDeps): PluginService["listDistributedPlugins"] {
  return async ({ caller }: ListDistributedPluginsParams) => {
    deps.requireAdmin(caller);
    return (await listDistributions(ctx.db)).map(toDistributedPluginView);
  };
}
