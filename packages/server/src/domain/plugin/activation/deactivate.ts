// domain/plugin/activation/deactivate — tear a resident plugin down (02 §4/§5, 03 §5). Unregister EVERY
// collected registration (no ghost tools/transforms/subscriptions — a disabled/uninstalled plugin's tool must
// never stay callable), dispose the guest instance through the port, and drop it from the resident registry.
// Idempotent: deactivating a plugin with no resident instance is a no-op (a disabled plugin, a double-disable).

import type { PluginId } from "@orb/kit/ids";
import type { PluginContext, PluginRegistry } from "../contract/service";

export function createDeactivate(ctx: PluginContext, registry: PluginRegistry): (pluginId: PluginId) => void {
  return (pluginId: PluginId): void => {
    const resident = registry.get(pluginId);
    if (resident === undefined) {
      return;
    }
    for (const handle of resident.handles) {
      handle.unregister();
    }
    ctx.host.dispose(resident.instance);
    registry.delete(pluginId);
  };
}
