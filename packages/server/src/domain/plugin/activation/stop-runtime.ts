// Process teardown is not durable deactivation: enabled rows and provider contributions survive a restart.

import type { PluginContext, PluginRegistry } from "../contract/service.ts";

/** Remove transient registrations after the service has joined its domain continuations. */
export function createStopRuntime(ctx: PluginContext, registry: PluginRegistry): () => void {
  return (): void => {
    using registrations = new DisposableStack();
    for (const [pluginId, resident] of registry) {
      registrations.defer(() => ctx.host.dispose(resident.instance));
      for (const handle of resident.handles) {
        registrations.defer(() => handle.unregister());
      }
      registrations.defer(() => ctx.ops.suggestions.voidForPlugin(pluginId));
      registrations.defer(() => ctx.surfaceState.clearForPlugin(pluginId));
      registrations.defer(() => ctx.uiOutbox.clearForPlugin(pluginId));
    }
    registry.clear();
  };
}
