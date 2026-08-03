// verb: getPluginLog — the host.log ring for an owned plugin (03 §3). Owner-scoped (the read gate); a plugin
// with no resident instance (disabled/errored) has no ring → empty. The ring is a non-destructive snapshot
// read through the port (the ring lives in the resident instance); `limit` caps to the last N lines
// (newest-last, the ring's natural order).

import { PluginNotFoundError } from "../contract/errors.ts";
import type { GetPluginLogParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createGetPluginLog(ctx: PluginContext, registry: PluginRegistry): PluginService["getLog"] {
  return async ({ caller, pluginId, limit }: GetPluginLogParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    const resident = registry.get(pluginId);
    if (resident === undefined) {
      return [];
    }
    const log = ctx.host.readLog(resident.instance);
    return limit === undefined ? log : log.slice(-limit);
  };
}
