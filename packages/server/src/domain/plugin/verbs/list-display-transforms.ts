// verb: listDisplayTransforms — the caller's OWN enabled plugins' registered DISPLAY transforms
// (U6, seam 14). Owner-scoped by construction, the `listSurfaces` posture: `listOwned`
// filters `WHERE owner_id = caller.userId`, a disabled/errored plugin has no resident instance, and no foreign
// id is accepted anywhere — the read IS the gate.
//
// ITS ONE JOB IS THE BYTE-IDENTITY GATE, and that is why it exists as a separate verb rather than a field on
// `listSurfaces`. The display round-trip is PER ROW; a viewer with no display transforms must make ZERO per-row
// calls, and the only way to know that cheaply is one room-level query whose empty answer the transcript can
// hold. Empty result ⇒ the client renders exactly as it did before this seam existed.

import type { ListDisplayTransformsParams } from "../contract/params.ts";
import type { PluginDisplayTransformView } from "../contract/results.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";

export function createListDisplayTransforms(ctx: PluginContext, registry: PluginRegistry): PluginService["listDisplayTransforms"] {
  return async ({ caller }: ListDisplayTransformsParams) => {
    const rows = await listOwned(ctx.db, caller.userId);
    const views: PluginDisplayTransformView[] = [];
    for (const row of rows) {
      const resident = registry.get(row.id);
      if (resident === undefined) {
        continue;
      }
      for (const transform of resident.instance.displayTransforms) {
        views.push({ pluginId: row.id, name: transform.name });
      }
    }
    return views;
  };
}
