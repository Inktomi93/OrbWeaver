// The local Extensions compositions: page selection identity and resolved empty state, not separate server wires.
import type { PluginView } from "@orb/contracts/plugin";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import type { PluginPageKey } from "#state";
import type { EXTENSIONS_EMPTY_COPY } from "../lib/extensions-copy.ts";

type RegisteredSurface = inferOutput<Trpc["plugin"]["listSurfaces"]>[number];
export type PluginPageView = Pick<RegisteredSurface, "pluginId" | "title" | "tier"> & {
  readonly key: PluginPageKey;
  readonly surfaceId: RegisteredSurface["id"];
  readonly pluginName: PluginView["name"];
  readonly grants: PluginView["grantedCapabilities"];
  readonly scriptedIds: readonly RegisteredSurface["id"][];
  readonly spec: RegisteredSurface["spec"];
};
export interface ExtensionsEmptyView {
  readonly reason: keyof typeof EXTENSIONS_EMPTY_COPY | null;
  readonly awaitingPlugins: readonly PluginView[];
  readonly erroredCount: number;
}
