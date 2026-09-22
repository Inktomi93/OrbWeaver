// Per-plugin lifecycle serialization. One installed plugin has one mutable process plane: its durable row,
// guest instance, registrations, and provider contributions must move together. Management verbs and the
// crash auto-disable path all enter through this lane, so an uninstall cannot overtake an enable and leave
// the process registry holding state for a row that no longer exists.

import type { PluginId } from "@orb/kit/ids";
import type { PluginLifecycleLanes } from "../contract/ops.ts";

/** Process-local by design: the resident guest and registration maps it protects are process-local too. */
export function createPluginLifecycleLanes(): PluginLifecycleLanes {
  const tails = new Map<PluginId, Promise<void>>();
  return {
    run: async <T>(pluginId: PluginId, job: () => Promise<T>): Promise<T> => {
      const prior = tails.get(pluginId) ?? Promise.resolve();
      const { promise: tail, resolve: release } = Promise.withResolvers<void>();
      tails.set(pluginId, tail);
      await prior;
      try {
        return await job();
      } finally {
        release();
        if (tails.get(pluginId) === tail) {
          tails.delete(pluginId);
        }
      }
    },
  };
}
