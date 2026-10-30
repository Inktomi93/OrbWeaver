// DEV plugin readers use the owner's production APIs. The log reader resolves a slug or install id;
// the UI inventory keeps runtime registrations separate from current cache and host observations.

import type { PluginId } from "@orb/kit/ids";
import type { OrbPluginListEntry, OrbPluginLogReader, OrbPluginLogResult } from "../../lib/agent-plugin-bridge.ts";

export { buildAgentPluginUi } from "./ui.ts";

/** The two read operations this bridge actually consumes. Keeping the port narrow lets focused tests
 * prove the bridge without fabricating the rest of AppRouter. */
export interface AgentPluginClient {
  readonly plugin: {
    readonly list: {
      readonly query: () => Promise<readonly OrbPluginListEntry[]>;
    };
    readonly getLog: {
      readonly query: (params: {
        readonly pluginId: PluginId;
      }) => Promise<readonly { readonly level: string; readonly message: string; readonly at: number }[]>;
    };
  };
}

export function buildAgentPlugin(client: AgentPluginClient): OrbPluginLogReader {
  return async (ref?: string): Promise<OrbPluginLogResult> => {
    const installed = await client.plugin.list.query();
    const plugins: OrbPluginListEntry[] = installed.map((view) => ({
      id: view.id,
      slug: view.slug,
      name: view.name,
      version: view.version,
      status: view.status,
    }));
    if (ref === undefined) {
      return { ok: true, plugins };
    }
    const matches = plugins.filter((entry) => entry.slug === ref || entry.id === ref);
    const [plugin] = matches;
    if (plugin === undefined) {
      const known = plugins.map((entry) => entry.slug).join(", ");
      return { ok: false, reason: `no installed plugin matches "${ref}" by slug or id — installed: ${known === "" ? "(none)" : known}` };
    }
    if (matches.length > 1) {
      return { ok: false, reason: `"${ref}" matches ${matches.length} installed plugins — pass the id` };
    }
    const log = await client.plugin.getLog.query({ pluginId: plugin.id });
    return { ok: true, plugin, log };
  };
}
