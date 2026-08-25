// plugin-surfaces-panel — mounts a plugin's own `settings`-anchored UI surfaces inside its row (plugin-ui-plane
// #679 U1, §4.5: "spec rendered inside the plugin's row/detail — ST's per-extension settings drawer"). Reads
// the caller's own `listSurfaces` (cached, shared across rows) and renders each of THIS plugin's settings
// surfaces in the first-party plugin-labelled shell. `listSurfaces` returns only ENABLED plugins' surfaces, so
// a disabled plugin renders nothing here; a static surface with no `spec` is skipped (it renders nothing until
// its scripted tier lands, U4).

import type { PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginSurfacesPanelProps {
  readonly pluginId: PluginId;
  readonly pluginName: string;
}

/** The plugin's rendered settings surfaces, each in its attribution shell. `null` when the plugin has none
 *  (disabled, or no `settings` surface with a spec). */
export function PluginSurfacesPanel({ pluginId, pluginName }: PluginSurfacesPanelProps): ReactElement | null {
  const trpc = useTRPC();
  // Not a suspense read: the panel is secondary chrome inside an already-rendered row, so it appears when the
  // (cached, shared) surface list resolves rather than blocking the row behind a boundary.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const mine = (surfaces ?? []).filter((surface) => surface.pluginId === pluginId && surface.anchor === "settings" && surface.spec !== undefined);
  if (mine.length === 0) {
    return null;
  }
  return (
    <Stack gap="block">
      {mine.map((surface) => (
        <PluginSurfaceShell key={surface.id} pluginName={pluginName} title={surface.title}>
          {surface.spec === undefined ? null : <PluginSurfaceRenderer pluginId={pluginId} spec={surface.spec} surfaceId={surface.id} />}
        </PluginSurfaceShell>
      ))}
    </Stack>
  );
}
