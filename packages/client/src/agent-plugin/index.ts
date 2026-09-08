// Dev-only PLUGIN LOG read bridge — the `__orb.pluginLog(ref?)` impl. It rides the EXISTING owner-scoped
// tRPC reads (`plugin.list` for the installed-plugin list, `plugin.getLog` for one plugin's runtime host.log
// ring) so an agent driving a live stage reads exactly what the Plugins settings surface reads — including,
// since #806, the lines a FLOATED guest continuation logged between invocations (a hub search's
// `search failed: …`), which `plugin.getLog` used to structurally lose. No ref ⇒ the installed-plugin list
// (id · slug · name · version · status); a ref resolves against slug OR id and REFUSES loudly on no match or
// an ambiguous one — never a silent empty. Read-only by construction: no mutation has a bridge here (the
// `agent-rpg/` posture).

import type { TrpcClient } from "#data";
import type { OrbPluginListEntry, OrbPluginLogReader, OrbPluginLogResult } from "../lib/agent-plugin-bridge.ts";

export function buildAgentPlugin(client: TrpcClient): OrbPluginLogReader {
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
