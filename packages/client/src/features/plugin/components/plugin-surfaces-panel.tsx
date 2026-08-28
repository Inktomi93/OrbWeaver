// plugin-surfaces-panel — mounts a plugin's own `settings`-anchored UI surfaces inside its row (plugin-ui-plane
// #679 U1, §4.5: "spec rendered inside the plugin's row/detail — ST's per-extension settings drawer"). Reads
// the caller's own `listSurfaces` (cached, shared across rows) and renders each of THIS plugin's settings
// surfaces in the first-party plugin-labelled shell. `listSurfaces` returns only ENABLED plugins' surfaces, so
// a disabled plugin renders nothing here.
//
// BOTH TIERS MOUNT HERE (U4). A `static` surface renders its server-registered `spec`; a `scripted` one hands
// off to `PluginScriptedSurface`, which boots the plugin's client guest and draws whatever tree it publishes.
// The shell, the label and the row are identical either way — the tier changes who COMPUTES the tree, never
// what a person sees around it. A static surface with no `spec` is still skipped: it has nothing to draw and,
// unlike a scripted one, nothing that will ever compute it.

import type { PluginCapability } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { PluginScriptedSurface } from "./plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginSurfacesPanelProps {
  readonly pluginId: PluginId;
  readonly pluginName: string;
  /** The plugin's granted capabilities, handed to a scripted guest for feature-detection (display-only — the
   *  server re-gates every host call against the stored row). Read off the row this panel already renders in. */
  readonly grants: readonly PluginCapability[];
}

/** The plugin's rendered settings surfaces, each in its attribution shell. `null` when the plugin has none
 *  (disabled, or no `settings` surface this panel can draw). */
export function PluginSurfacesPanel({ pluginId, pluginName, grants }: PluginSurfacesPanelProps): ReactElement | null {
  const trpc = useTRPC();
  // Not a suspense read: the panel is secondary chrome inside an already-rendered row, so it appears when the
  // (cached, shared) surface list resolves rather than blocking the row behind a boundary.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const all = surfaces ?? [];
  const mine = all.filter(
    (surface) => surface.pluginId === pluginId && surface.anchor === "settings" && (surface.tier === "scripted" || surface.spec !== undefined),
  );
  if (mine.length === 0) {
    return null;
  }
  // EVERY scripted id this plugin registered, at any anchor — one worker serves them all, so an allow-list
  // scoped to the settings anchor would silently drop a room widget's renders.
  const scriptedIds = all.filter((surface) => surface.pluginId === pluginId && surface.tier === "scripted").map((surface) => surface.id);
  return (
    <Stack gap="block">
      {mine.map((surface) => (
        <PluginSurfaceShell key={surface.id} pluginName={pluginName} title={surface.title}>
          {surface.tier === "scripted" ? (
            <PluginScriptedSurface grants={grants} pluginId={pluginId} surfaceId={surface.id} surfaceIds={scriptedIds} />
          ) : (
            surface.spec !== undefined && <PluginSurfaceRenderer pluginId={pluginId} spec={surface.spec} surfaceId={surface.id} />
          )}
        </PluginSurfaceShell>
      ))}
    </Stack>
  );
}
