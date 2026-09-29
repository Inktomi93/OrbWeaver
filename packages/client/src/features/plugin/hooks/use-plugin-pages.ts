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

import type { PluginCapability, PluginSurfaceSpec, PluginSurfaceTier } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { PluginPageKey } from "#state";
import { pluginPageKey } from "#state";

/** One registered extension page as the switcher + the content pane read it. */
export interface PluginPageView {
  /** The drill key the selection store holds (`<pluginId>:<surfaceId>`) — minted through the ONE seam. */
  readonly key: PluginPageKey;
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  /** The plugin's display name — the attribution band's first line. */
  readonly pluginName: string;
  /** The surface's own `title` — the switcher row and the band's second line. */
  readonly title: string;
  /** WHO computes the surface (#787). `static`/`scripted` render a declarative tree through the shell; `frame`
   *  (U7) draws the plugin's own document in an isolated iframe and carries no `spec` at all — the content pane
   *  branches on this to mount a `PluginFrame` instead of the renderer. */
  readonly tier: PluginSurfaceTier;
  /** The plugin's current grants, exposed to a scripted guest for feature detection only. */
  readonly grants: readonly PluginCapability[];
  /** Every scripted id owned by this plugin; the guest rejects publications outside this allow-list. */
  readonly scriptedIds: readonly string[];
  /** The declarative tree, absent for a scripted-tier surface whose client guest computes it (and for every
   *  `frame`-tier surface, which produces a document, not a tree). */
  readonly spec: PluginSurfaceSpec | undefined;
}

export interface PluginPagesState {
  readonly pages: readonly PluginPageView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly retry: () => void;
}

/**
 * Every extension page the caller can open, in a stable order: by plugin name, then by surface title. The order
 * is DERIVED and not a registration order on purpose — a switcher whose rows reshuffle when a plugin
 * re-registers is a list nobody can build muscle memory in.
 *
 * Not a suspense read: the Extensions section renders its own boundary and its own empty, and a switcher that
 * suspends the whole CONTENT region while the page you are reading is already painted is the wrong trade.
 */
export function usePluginPagesState(): PluginPagesState {
  const trpc = useTRPC();
  const surfacesQuery = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const pluginsQuery = useQuery(trpc.plugin.list.queryOptions());
  const surfaces = surfacesQuery.data;
  const plugins = pluginsQuery.data;
  const rows = plugins ?? [];
  const pluginsById = new Map(rows.map((plugin) => [plugin.id, plugin] as const));
  const allSurfaces = surfaces ?? [];
  const pages: PluginPageView[] = [];
  for (const surface of allSurfaces) {
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
      scriptedIds: allSurfaces.filter((candidate) => candidate.pluginId === surface.pluginId && candidate.tier === "scripted").map((candidate) => candidate.id),
      spec: surface.spec,
    });
  }
  return {
    pages: pages.toSorted((a, b) => a.pluginName.localeCompare(b.pluginName) || a.title.localeCompare(b.title)),
    isPending: surfacesQuery.isPending || pluginsQuery.isPending,
    isError: surfacesQuery.isError || pluginsQuery.isError,
    retry: (): void => {
      void Promise.all([surfacesQuery.refetch(), pluginsQuery.refetch()]).catch((error: unknown) => globalThis.reportError(error));
    },
  };
}

export function usePluginPages(): readonly PluginPageView[] {
  return usePluginPagesState().pages;
}
