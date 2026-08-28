// plugin-anchored-surfaces — the ONE fan-out behind every CHAT anchor (plugin-ui-plane #679 U2, §4.5): given
// one `PluginSurfaceAnchor`, it renders every surface the CALLER's own enabled plugins registered there, each
// inside the first-party labelled shell. The door grows by FIXED first-party contributions (`lib/chat-anchors.tsx`),
// never per-plugin (the one-assembly law G8) — the per-plugin fan happens HERE, off `plugin.listSurfaces` data.
//
// THREE PROPERTIES, each load-bearing and each the reason this is not three components:
//
//  1. NON-SUSPENDING. Both room anchors mount inside contribution seams with no Suspense boundary of their own
//     (`chat-room-surface.tsx`'s flank; the "This chat" host band), so a `useSuspenseQuery` here would suspend
//     the WHOLE room on a widget most people do not have. Every read is a plain `useQuery`; undefined data reads
//     as "nothing to show yet", the same arm as "no plugins".
//  2. SILENT-BY-DEFAULT — it returns `null`, never an empty wrapper. The flank column collapses on `:empty`
//     (`empty:hidden`), and `:empty` counts ELEMENT children regardless of paint: an empty `<Stack>` here would
//     keep the flank column in the room's flex layout and cost every plugin-less room a `gap="block"` step
//     beside the transcript — the #680 defect class, one level down. So "no surfaces / not loaded yet / a
//     bound surface with nothing published" all return literal `null` from THIS component.
//  3. LABELLED OR ABSENT. The shell's attribution line is the impersonation wall (§4.8), and its name comes
//     from the plugin row (`plugin.list`), a different read from the surface list. A surface whose plugin name
//     has not resolved is NOT rendered unlabelled — it waits.
//
// THE STATE GATE (§4.9's "a state-less surface renders NOTHING"): a spec that binds `{ $state }` renders its
// FALLBACKS until the plugin publishes — an empty meter and blank rows, i.e. a broken frame in the room. So a
// BOUND surface renders only once its state exists; a purely static spec (no bindings) renders on sight. The
// per-surface state reads are ONE `useQueries` (never a hook per row in a loop — the `useGreetingAlternates`
// precedent), and the renderer's own `getSurfaceState` read hits the same query key, so it costs no second call.

import type { PluginSurfaceAnchor, PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { specBindsState } from "../lib/plugin-surface-bindings.ts";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginAnchoredSurfacesProps {
  /** Which anchor's registrations to render — the CHAT anchors at U2 (`chat-flank`, `chat-settings-section`). */
  readonly anchor: PluginSurfaceAnchor;
}

/** One renderable registration: the surface's own meta narrowed to "has a spec", joined to its plugin's name.
 *  Local to this fan-out (a rendering partition, not a cross-boundary shape — the wire type is the router's). */
interface RenderableSurface {
  readonly pluginId: PluginId;
  readonly pluginName: string;
  readonly surfaceId: string;
  readonly title: string;
  readonly spec: PluginSurfaceSpec;
}

/** Every surface the caller's enabled plugins registered at `anchor`, each in its attribution shell. `null`
 *  when there is nothing to show — see property 2 in the header: this component's `null` is what keeps a
 *  plugin-less room byte-identical. */
export function PluginAnchoredSurfaces({ anchor }: PluginAnchoredSurfacesProps): ReactElement | null {
  const trpc = useTRPC();
  // `listSurfaces` is the caller's OWN enabled plugins' registrations (owner-scoped server-side, and a disabled
  // plugin has no resident instance, so it contributes nothing) — the v1 invariant is viewer == installer.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const names = new Map((plugins ?? []).map((row) => [row.id, row.name] as const));

  const candidates: RenderableSurface[] = [];
  for (const surface of surfaces ?? []) {
    const pluginName = names.get(surface.pluginId);
    // A `spec`-less registration is a scripted-tier (U4) surface — nothing to draw yet; an unnamed plugin is a
    // shell we could not label, and an unlabelled plugin surface is the one thing §4.8 forbids.
    if (surface.anchor !== anchor || surface.spec === undefined || pluginName === undefined) {
      continue;
    }
    candidates.push({ pluginId: surface.pluginId, pluginName, surfaceId: surface.id, title: surface.title, spec: surface.spec });
  }

  // ONE hook over N rows (never a hook per row): the published state each candidate's silence test needs.
  // `throwOnError: false` — a failed state read degrades that surface to silent, never into the room's boundary.
  const states = useQueries({
    queries: candidates.map((candidate) => ({
      ...trpc.plugin.getSurfaceState.queryOptions({ pluginId: candidate.pluginId, surfaceId: candidate.surfaceId }),
      throwOnError: false,
    })),
  });
  const visible = candidates.filter((candidate, index) => !specBindsState(candidate.spec) || (states[index]?.data ?? null) !== null);

  if (visible.length === 0) {
    return null;
  }
  return (
    <Stack gap="block">
      {visible.map((surface) => (
        <PluginSurfaceShell key={`${surface.pluginId}:${surface.surfaceId}`} pluginName={surface.pluginName} title={surface.title}>
          <PluginSurfaceRenderer pluginId={surface.pluginId} spec={surface.spec} surfaceId={surface.surfaceId} />
        </PluginSurfaceShell>
      ))}
    </Stack>
  );
}
