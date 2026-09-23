// plugin-message-footer-surfaces — the PER-ROW plugin decoration strip. One
// first-party contribution at chat's existing `message-footer` anchor renders every `message-footer` surface
// the CALLER's own enabled plugins registered, under each COMMITTED row.
//
// WHY IT IS A SEPARATE COMPONENT FROM `PluginAnchoredSurfaces`, which already fans by anchor: the per-row
// anchor is a different cost class and a different grammar, and both differences are structural.
//   • COST — this mounts once per transcript ROW, so every read it reaches must be keyed by something that is
//     NOT the row. All of them are: `listSurfaces` and `list` take no input, and the renderer's own state read
//     is keyed `(pluginId, surfaceId)` — so a 200-row transcript resolves all of them from the same handful of
//     cache entries and issues no per-row request. It also does NOT run the room fan-out's per-candidate
//     `useQueries` state pass (see the state gate below).
//     MEASURED, not assumed: the CT's byte-identity arms mount a real transcript and the unfed-read ratchet
//     names exactly which procedures the tree asks for.
//   • GRAMMAR — a footer is a decoration STRIP, not a panel: it renders at the shell's `inline` chrome (glyph
//     + plugin name + the badges, one line, no box). The attribution wall is unchanged; only the box is.
//
// The vocabulary bounds that make this safe are COMPILE- and REGISTRATION-tier, not conventions held here:
// `PLUGIN_ANCHOR_TIERS` refuses a scripted (and, at U7, a framed) surface at this anchor permanently, and
// `PLUGIN_FOOTER_NODE_KIND_ALLOWED` + the two per-row caps refuse a panel-shaped spec at registration
// (`@orb/contracts/plugin/ui`). By the time a spec reaches this component it is already a bounded badge strip.
//
// SILENT-BY-DEFAULT, the same law the flank obeys: `null`, never an empty wrapper. The host footer slot is
// `empty:hidden` (`message-row.tsx`), and `:empty` counts ELEMENT children regardless of paint — an empty
// `<Row>` here would give every plugin-less row a footer gap.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { specBindsState } from "../lib/plugin-surface-bindings.ts";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

/** One renderable footer registration — the room-level meta joined to its plugin's name. */
interface FooterSurface {
  readonly pluginId: PluginId;
  readonly pluginName: string;
  readonly surfaceId: string;
  readonly title: string;
  readonly spec: PluginSurfaceSpec;
}

/** Every `message-footer` surface the caller's enabled plugins registered, as one attribution-labelled strip.
 *  `null` when there is nothing to show — which is what keeps a plugin-less transcript byte-identical. */
export function PluginMessageFooterSurfaces(): ReactElement | null {
  const trpc = useTRPC();
  // Both reads are ROOM-level and shared: a transcript of 200 rows makes exactly these two requests, once.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const names = new Map((plugins ?? []).map((row) => [row.id, row.name] as const));

  const visible: FooterSurface[] = [];
  for (const surface of surfaces ?? []) {
    const pluginName = names.get(surface.pluginId);
    // THE STATE GATE — §4.9's "a state-less surface renders NOTHING", applied where the cost of getting it
    // wrong is multiplied by transcript length. The room fan-out withholds a bound surface until its state
    // lands by pre-reading state per candidate; a per-row mount does not run that pre-pass, so a bound footer
    // spec would paint its FALLBACKS (an empty badge, a blank caption) under every single message until the
    // plugin publishes — the broken-frame-in-the-room defect, once per row. A footer is a decoration a plugin
    // publishes as a STATIC spec; live per-surface data is what the room anchors are for.
    if (surface.anchor !== "message-footer" || surface.spec === undefined || pluginName === undefined || specBindsState(surface.spec)) {
      continue;
    }
    visible.push({ pluginId: surface.pluginId, pluginName, surfaceId: surface.id, title: surface.title, spec: surface.spec });
  }
  if (visible.length === 0) {
    return null;
  }
  return (
    <Row align="center" className="flex-wrap" gap="block">
      {visible.map((surface) => (
        <PluginSurfaceShell chrome="inline" key={`${surface.pluginId}:${surface.surfaceId}`} pluginName={surface.pluginName} title={surface.title}>
          <PluginSurfaceRenderer anchor="message-footer" pluginId={surface.pluginId} spec={surface.spec} surfaceId={surface.surfaceId} />
        </PluginSurfaceShell>
      ))}
    </Row>
  );
}
