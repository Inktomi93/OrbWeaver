// verb: listSurfaces — the caller's OWN enabled plugins' registered UI surfaces (plugin-ui-plane #679 U1).
// Owner-scoped by construction: `listOwned` filters `WHERE owner_id = caller.userId`, so the loop only ever
// consults the caller's own rows and a surface can only reach the result if the caller OWNS the plugin — the
// SAME "the read is the gate" posture as `listPlugins`, no foreign id anywhere. A disabled/errored plugin has
// no resident instance (nothing collected), so it contributes no surfaces. Each surface is projected to the
// serializable meta (the `onAction` handle stays server-side, re-entered only by `invokeUiAction`) tagged with
// its `pluginId` so the client joins to the plugin's own name/glyph for the labeled shell.

import type { PluginSurfaceRegistration } from "@orb/contracts/plugin";
import { pluginToolWireName } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import type { ListSurfacesParams } from "../contract/params.ts";
import type { PluginSurfaceView } from "../contract/results.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";

/** One collected registration → its client view. The `tool-card` LINKAGE is resolved to the MODEL-VISIBLE name
 *  HERE (U3): the guest named its own tool (`toolName`), and only this side knows the install's slug. One mint,
 *  in contracts — the client matches the projected string against `ToolCallRecord.name` and never re-derives
 *  the namespacing rule. */
function toView(pluginId: PluginId, slug: string, surface: PluginSurfaceRegistration): PluginSurfaceView {
  return {
    pluginId,
    id: surface.id,
    anchor: surface.anchor,
    title: surface.title,
    tier: surface.tier,
    ...(surface.spec !== undefined ? { spec: surface.spec } : {}),
    ...(surface.toolName !== undefined ? { toolName: surface.toolName, toolWireName: pluginToolWireName(slug, surface.toolName) } : {}),
  };
}

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
        views.push(toView(row.id, row.slug, surface));
      }
    }
    return views;
  };
}
