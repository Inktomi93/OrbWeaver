// domain/plugin/activation/deactivate — tear a resident plugin down. Unregister EVERY
// collected registration (no ghost tools/transforms/subscriptions — a disabled/uninstalled plugin's tool must
// never stay callable), dispose the guest instance through the port, and drop it from the resident registry.
// Idempotent: deactivating a plugin with no resident instance is a no-op (a disabled plugin, a double-disable).

import type { PluginId } from "@orb/kit/ids";
import type { PluginContext, PluginProviderLifecycle, PluginRegistry } from "../contract/service.ts";

export function createDeactivate(ctx: PluginContext, registry: PluginRegistry, providers: PluginProviderLifecycle): (pluginId: PluginId) => Promise<void> {
  return async (pluginId: PluginId): Promise<void> => {
    // Remove durable provider authority before tearing down the resident view. If persistence refuses, keep the
    // live instance coherent with its still-authoritative provider contribution and let the lifecycle fail.
    await providers.deactivate(pluginId);
    // VOID this plugin's pending posture-2 asks FIRST, and unconditionally — before the resident check, because
    // a plugin can hold pending cards while holding no resident instance (an upgrade tears the instance down and
    // lands the row disabled). The confirm-time liveness re-check is what makes a stale card SAFE; this is what
    // makes it DISAPPEAR, so a host is never offered an answer that would only refuse.
    ctx.ops.suggestions.voidForPlugin(pluginId);
    // Drop this plugin's published UI-surface state — unconditionally, for the same
    // reason as the pending asks above: a disabled plugin holds no resident instance yet its surfaces + their
    // state must not linger (a re-enable rebuilds surfaces from a fresh activation; a stale state row would
    // paint the pre-disable panel for a beat before the fresh publish).
    ctx.surfaceState.clearForPlugin(pluginId);
    // …and its pending HOST-MEDIATED chrome (U5): a toast or a dialog-open a disabled plugin queued must never
    // arrive later, and a dialog-open in particular would name a surface that no longer exists. Same
    // unconditional placement, same reason.
    ctx.uiOutbox.clearForPlugin(pluginId);
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
