// verb: listSurfaces — the caller's OWN enabled plugins' registered UI surfaces (plugin-ui-plane #679 U1).
// Owner-scoped by construction: `listOwned` filters `WHERE owner_id = caller.userId`, so the loop only ever
// consults the caller's own rows and a surface can only reach the result if the caller OWNS the plugin — the
// SAME "the read is the gate" posture as `listPlugins`, no foreign id anywhere. A disabled/errored plugin has
// no resident instance (nothing collected), so it contributes no surfaces. Each surface is projected to the
// serializable meta (the `onAction` handle stays server-side, re-entered only by `invokeUiAction`) tagged with
// its `pluginId` so the client joins to the plugin's own name/glyph for the labeled shell.

import type { ListSurfacesParams } from "../contract/params.ts";
import type { PluginSurfaceView } from "../contract/results.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";

export function createListSurfaces(ctx: PluginContext, registry: PluginRegistry): PluginService["listSurfaces"] {
  return async ({ caller }: ListSurfacesParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    const views: PluginSurfaceView[] = [];
    for (const row of rows) {
      const resident = registry.get(row.id);
      if (resident === undefined) {
        continue;
      }
      for (const surface of resident.instance.surfaces) {
        views.push({
          pluginId: row.id,
          id: surface.id,
          anchor: surface.anchor,
          title: surface.title,
          tier: surface.tier,
          ...(surface.spec !== undefined ? { spec: surface.spec } : {}),
        });
      }
    }
    return views;
  };
}
