// plugin-surfaces-panel — mounts a plugin's own `settings`-anchored UI surfaces inside its row
// ("spec rendered inside the plugin's row/detail — ST's per-extension settings drawer"). Reads
// the caller's own `listSurfaces` (cached, shared across rows) and renders each of THIS plugin's settings
// surfaces in the first-party plugin-labelled shell. `listSurfaces` returns only ENABLED plugins' surfaces, so
// a disabled plugin renders nothing here; a static surface with no `spec` is skipped (it has nothing to draw
// and, unlike a scripted one, nothing that will ever compute it).
//
// ALL THREE TIERS MOUNT HERE. A `static` surface renders its server-registered `spec`; a `scripted` one (U4)
// hands off to `PluginScriptedSurface`, which boots the plugin's client guest and draws whatever tree it
// publishes; a `frame` one (U7 — §6.1's "arbitrary-HTML settings look", served on the installer's OWN settings
// screen under their own grant) hands off to `PluginFrame`, which draws its own shell so an un-minted frame
// contributes no empty box. The tier changes who COMPUTES the surface, never what a person sees around it.

import type { PluginCapability } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { PluginFrame } from "./plugin-frame.tsx";
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
    (surface) =>
      surface.pluginId === pluginId && surface.anchor === "settings" && (surface.tier === "scripted" || surface.tier === "frame" || surface.spec !== undefined),
  );
  if (mine.length === 0) {
    return null;
  }
  // EVERY scripted id this plugin registered, at any anchor — one worker serves them all, so an allow-list
  // scoped to the settings anchor would silently drop a room widget's renders.
  const scriptedIds = all.filter((surface) => surface.pluginId === pluginId && surface.tier === "scripted").map((surface) => surface.id);
  return (
    <Stack gap="block">
      {mine.map((surface) => {
        // U7 frame → its OWN shell (`PluginFrame`); scripted (U4) → the client guest; static → the renderer.
        if (surface.tier === "frame") {
          return <PluginFrame key={surface.id} pluginId={pluginId} pluginName={pluginName} surfaceId={surface.id} title={surface.title} />;
        }
        return (
          <PluginSurfaceShell key={surface.id} pluginName={pluginName} title={surface.title}>
            {surface.tier === "scripted" ? (
              <PluginScriptedSurface anchor="settings" grants={grants} pluginId={pluginId} surfaceId={surface.id} surfaceIds={scriptedIds} />
            ) : (
              // The filter guarantees a static surface has a spec; the guard keeps the type narrow.
              surface.spec !== undefined && <PluginSurfaceRenderer anchor="settings" pluginId={pluginId} spec={surface.spec} surfaceId={surface.id} />
            )}
          </PluginSurfaceShell>
        );
      })}
    </Stack>
  );
}
