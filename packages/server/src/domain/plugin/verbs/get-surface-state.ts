// verb: getSurfaceState — one owned surface's published state (plugin-ui-plane #679 U1). Owner-scoped: the
// `getById(db, caller.userId, pluginId)` load IS the gate (a foreign pluginId reads absent → leak-free
// NOT_FOUND, never an existence oracle), the SAME authority model every per-row plugin verb uses (D147). The
// v1 invariant is viewer == installer, so the surface state's one legitimate reader is exactly this owner. The
// state plane is in-memory (`ctx.surfaceState`, respawn wipes); `null` when the plugin has published nothing
// for that surface (or the surface id is unknown) — the renderer binds `null` to each node's fallback.

import { PluginNotFoundError } from "../contract/errors.ts";
import type { GetSurfaceStateParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createGetSurfaceState(ctx: PluginContext): PluginService["getSurfaceState"] {
  return async ({ caller, pluginId, surfaceId }: GetSurfaceStateParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return ctx.surfaceState.get(pluginId, surfaceId);
  };
}
