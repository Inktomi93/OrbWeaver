// Shipped examples are installed ungranted, with a standing consent request; upgrades use the real consent wall.
import type { PluginSeedOps, PluginSeedSource } from "../contract/seed-ops.ts";

export function createPluginSeedOps(plugin: PluginSeedSource): PluginSeedOps {
  return {
    install: async ({ caller, bundle }) => await plugin.install({ caller, bundle, grant: [] }),
    requestConsent: async ({ caller, pluginId }): Promise<void> => {
      await plugin.setGrant({ caller, pluginId, grant: [], acknowledgedNetHosts: [] });
    },
    upgrade: async (args): Promise<void> => {
      await plugin.upgrade(args);
    },
    listHeld: async (caller) => (await plugin.list({ caller })).map((row) => ({ slug: row.slug, pluginId: row.id, version: row.version })),
    apply: async (principal) => await plugin.applyDistributedPlugins({ caller: principal }),
  };
}
