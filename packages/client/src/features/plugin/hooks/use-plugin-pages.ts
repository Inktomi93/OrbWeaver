// The EXTENSIONS section's read: every `page`-anchored surface across the
// caller's granted-and-enabled plugins, joined to the plugin's own display name.
//
// TWO CACHE-FIRST READS, NOT ONE, and the join is here rather than on the wire: `plugin.listSurfaces` returns
// surfaces tagged with their `pluginId` (the U1 shape, already read by the settings panel, the chat flank and
// the tool card), and `plugin.list` is the owner's plugin catalog every plugin surface in the app already has
// loaded. TanStack dedupes both by key, so the switcher costs no request the pane did not already make — and
// widening the wire shape to carry a name the client already holds would give the plugin's display name a
// second home that drifts on rename.
//
// A surface whose plugin is not in `list` is DROPPED rather than rendered nameless: the attribution band is the
// impersonation wall (§4.8/§9), and a page drawn without a name is exactly the surface that wall exists to
// prevent. `listSurfaces` only ever returns the caller's own enabled plugins, so this arm is a race (a disable
// between the two reads settling), not a state.

import type { PluginView } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useSuspenseQuery, useTRPC } from "#data";
import type { PluginPageKey } from "#state";
import { pluginPageKey } from "#state";

type RegisteredSurface = inferOutput<Trpc["plugin"]["listSurfaces"]>[number];

export type PluginPageView = Pick<RegisteredSurface, "pluginId" | "title" | "tier"> & {
  readonly key: PluginPageKey;
  readonly surfaceId: RegisteredSurface["id"];
  readonly pluginName: PluginView["name"];
  readonly grants: PluginView["grantedCapabilities"];
  readonly scriptedIds: readonly RegisteredSurface["id"][];
  readonly spec: RegisteredSurface["spec"];
};

/** Not a surface id: `PLUGIN_SURFACE_ID_RE` refuses `#` at registration, so no page key can equal a review key. */
const REVIEW_SURFACE = "#review";

/** The Plugin pages drill key for reviewing ONE waiting plugin's ask in place, beside its pages' keys. */
export function pluginReviewKey(pluginId: PluginId): PluginPageKey {
  return pluginPageKey(pluginId, REVIEW_SURFACE);
}

type PluginRow = inferOutput<Trpc["plugin"]["list"]>[number];

/**
 * Every extension page the caller can open, in a stable order: by plugin name, then by surface title. The order
 * is DERIVED and not a registration order on purpose — a switcher whose rows reshuffle when a plugin
 * re-registers is a list nobody can build muscle memory in.
 */
function joinPluginPages(surfaces: readonly RegisteredSurface[], plugins: readonly PluginRow[]): readonly PluginPageView[] {
  const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin] as const));
  const pages: PluginPageView[] = [];
  for (const surface of surfaces) {
    if (surface.anchor !== "page") {
      continue;
    }
    const plugin = pluginsById.get(surface.pluginId);
    if (plugin === undefined) {
      continue;
    }
    pages.push({
      key: pluginPageKey(surface.pluginId, surface.id),
      pluginId: surface.pluginId,
      surfaceId: surface.id,
      pluginName: plugin.name,
      title: surface.title,
      tier: surface.tier,
      grants: plugin.grantedCapabilities,
      scriptedIds: surfaces.filter((candidate) => candidate.pluginId === surface.pluginId && candidate.tier === "scripted").map((candidate) => candidate.id),
      spec: surface.spec,
    });
  }
  return pages.toSorted((a, b) => a.pluginName.localeCompare(b.pluginName) || a.title.localeCompare(b.title));
}

/** The pages as a value with a default, for the switcher, the list header and the selection title: a switcher that
 *  suspends the whole CONTENT region while the page you are reading is already painted is the wrong trade. */
export function usePluginPages(): readonly PluginPageView[] {
  const trpc = useTRPC();
  const surfaces = useQuery(trpc.plugin.listSurfaces.queryOptions()).data;
  const plugins = useQuery(trpc.plugin.list.queryOptions()).data;
  return joinPluginPages(surfaces ?? [], plugins ?? []);
}

/** The pages for the CONTENT pane's selected page, which suspends under that pane's own boundary until both reads land. */
export function useSuspensePluginPages(): readonly PluginPageView[] {
  const trpc = useTRPC();
  const { data: surfaces } = useSuspenseQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useSuspenseQuery(trpc.plugin.list.queryOptions());
  return joinPluginPages(surfaces, plugins);
}
