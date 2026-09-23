// plugin-anchored-surfaces — the ONE fan-out behind every CHAT anchor: given
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

import type { PluginCapability, PluginSurfaceAnchor, PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { specBindsState } from "../lib/plugin-surface-bindings.ts";
import { PluginFrame } from "./plugin-frame.tsx";
import { PluginScriptedSurface } from "./plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

/** The two wire reads this fan-out joins, tRPC-INFERRED — so a reshape of either breaks here at compile time
 *  rather than at a runtime `undefined`. */
type PluginSurfaceView = inferOutput<Trpc["plugin"]["listSurfaces"]>[number];
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

export interface PluginAnchoredSurfacesProps {
  /** Which anchor's registrations to render — the CHAT anchors at U2 (`chat-flank`, `chat-settings-section`). */
  readonly anchor: PluginSurfaceAnchor;
  /** The ROOM this anchor is mounted in (row 777). Absent = a draft room with no committed id: the fan-out
   *  then reads/writes the plugin-wide state row only, which is the honest answer (there is no room yet for a
   *  room-keyed publication to belong to). */
  readonly chatId?: ChatId;
}

/** One renderable registration: the surface's own meta joined to its plugin's name and — for the SCRIPTED tier
 *  — its plugin's grants and sibling surface ids. Local to this fan-out (a rendering partition, not a
 *  cross-boundary shape; the wire type is the router's).
 *
 *  The TIER is the discriminant, because the three tiers need genuinely different things: a `static` surface has
 *  a server-registered `spec` and a state row to bind against; a `scripted` one has NEITHER until its guest boots
 *  and publishes — its spec IS the thing being computed (U4); a `frame` one renders its OWN document in an
 *  isolated iframe and has no spec and no published-state plane at all (U7). */
type RenderableSurface =
  | {
      readonly tier: "static";
      readonly pluginId: PluginId;
      readonly pluginName: string;
      readonly surfaceId: string;
      readonly title: string;
      readonly spec: PluginSurfaceSpec;
    }
  | {
      readonly tier: "scripted";
      readonly pluginId: PluginId;
      readonly pluginName: string;
      readonly surfaceId: string;
      readonly title: string;
      /** The plugin's granted capabilities — handed to the guest for feature-detection (display-only). */
      readonly grants: readonly PluginCapability[];
      /** EVERY scripted surface id this plugin registered, at any anchor: one worker serves them all, and the
       *  worker's render allow-list has to cover the whole set or a plugin's second surface silently never
       *  paints. */
      readonly scriptedIds: readonly string[];
    }
  | {
      /** U7 frame: `PluginFrame` mints and renders the isolated document; this fan-out only labels + places it. */
      readonly tier: "frame";
      readonly pluginId: PluginId;
      readonly pluginName: string;
      readonly surfaceId: string;
      readonly title: string;
    };

/** Partition the caller's own registrations into what THIS anchor can render. Pure and hook-free, so the
 *  component below stays a hook sequence plus JSX. */
function buildCandidates(surfaces: readonly PluginSurfaceView[], plugins: readonly PluginView[], anchor: PluginSurfaceAnchor): RenderableSurface[] {
  const rows = new Map(plugins.map((row) => [row.id, row] as const));
  // Every SCRIPTED surface id per plugin, across every anchor — the worker's render allow-list. Built from the
  // WHOLE list rather than the filtered candidates because one worker serves a plugin's surfaces wherever they
  // are mounted, and an allow-list scoped to this anchor would silently drop a sibling's renders.
  const scriptedIdsByPlugin = new Map<PluginId, string[]>();
  for (const surface of surfaces) {
    if (surface.tier === "scripted") {
      scriptedIdsByPlugin.set(surface.pluginId, [...(scriptedIdsByPlugin.get(surface.pluginId) ?? []), surface.id]);
    }
  }

  const candidates: RenderableSurface[] = [];
  for (const surface of surfaces) {
    const row = rows.get(surface.pluginId);
    // An unnamed plugin is a shell we could not label, and an unlabelled plugin surface is the one thing §4.8
    // forbids — so it WAITS rather than rendering bare.
    if (surface.anchor !== anchor || row === undefined) {
      continue;
    }
    const common = { pluginId: surface.pluginId, pluginName: row.name, surfaceId: surface.id, title: surface.title } as const;
    if (surface.tier === "scripted") {
      candidates.push({ ...common, tier: "scripted", grants: row.grantedCapabilities, scriptedIds: scriptedIdsByPlugin.get(surface.pluginId) ?? [surface.id] });
      continue;
    }
    // A U7 FRAME surface draws a document and legitimately carries NO spec — `PluginFrame` mints it.
    if (surface.tier === "frame") {
      candidates.push({ ...common, tier: "frame" });
      continue;
    }
    // A static surface with NO spec has nothing to draw and no guest that will ever compute one.
    if (surface.spec !== undefined) {
      candidates.push({ ...common, tier: "static", spec: surface.spec });
    }
  }
  return candidates;
}

/** Every surface the caller's enabled plugins registered at `anchor`, each in its attribution shell. `null`
 *  when there is nothing to show — see property 2 in the header: this component's `null` is what keeps a
 *  plugin-less room byte-identical. */
export function PluginAnchoredSurfaces({ anchor, chatId }: PluginAnchoredSurfacesProps): ReactElement | null {
  const trpc = useTRPC();
  // `listSurfaces` is the caller's OWN enabled plugins' registrations (owner-scoped server-side, and a disabled
  // plugin has no resident instance, so it contributes nothing) — the v1 invariant is viewer == installer.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const candidates = buildCandidates(surfaces ?? [], plugins ?? [], anchor);

  // ONE hook over N rows (never a hook per row): the published state each STATIC candidate's silence test needs.
  // `throwOnError: false` — a failed state read degrades that surface to silent, never into the room's boundary.
  // A scripted candidate reads NOTHING here (its state is its guest's), so its query is disabled rather than
  // skipped: the array has to stay index-aligned with `candidates` for the filter below, and a hook count that
  // varied by tier would break the rules of hooks on the very next re-render.
  const states = useQueries({
    queries: candidates.map((candidate) => ({
      ...trpc.plugin.getSurfaceState.queryOptions({
        pluginId: candidate.pluginId,
        surfaceId: candidate.surfaceId,
        ...(chatId === undefined ? {} : { chatId }),
      }),
      enabled: candidate.tier === "static",
      throwOnError: false,
    })),
  });
  // THE SILENCE TEST (§4.9) APPLIES TO THE STATIC ARM ONLY. A `static` surface binding `{ $state }` renders its
  // fallbacks — an empty meter, blank rows — until its plugin publishes, so it waits for state. A `scripted`
  // surface renders nothing until its guest publishes a tree (that decision lives in the mount); a `frame`
  // surface has no bindings and no published-state plane at all (`PluginFrame` answers its "nothing yet" with
  // `null`) — so both skip the gate. The `tier !== "static"` guard is also what keeps `candidate.spec` type-safe:
  // only the static arm carries a `spec`.
  const visible = candidates.filter(
    (candidate, index) => candidate.tier !== "static" || !specBindsState(candidate.spec) || (states[index]?.data ?? null) !== null,
  );

  if (visible.length === 0) {
    return null;
  }
  return (
    <Stack gap="block">
      {visible.map((surface) => {
        // The U7 FRAME arm draws its OWN shell (`plugin-frame.tsx`: an un-minted frame must render nothing at
        // all, chrome included, and the §4.8 label must have no opt-out). The `scripted` (U4) and `static` arms
        // render inside the shared attribution shell — the state gate above has already proven the static one
        // has something to draw.
        if (surface.tier === "frame") {
          return (
            <PluginFrame
              key={`${surface.pluginId}:${surface.surfaceId}`}
              pluginId={surface.pluginId}
              pluginName={surface.pluginName}
              surfaceId={surface.surfaceId}
              title={surface.title}
              chatId={chatId}
            />
          );
        }
        return (
          <PluginSurfaceShell key={`${surface.pluginId}:${surface.surfaceId}`} pluginName={surface.pluginName} title={surface.title}>
            {surface.tier === "scripted" ? (
              <PluginScriptedSurface
                anchor={anchor}
                grants={surface.grants}
                pluginId={surface.pluginId}
                surfaceId={surface.surfaceId}
                surfaceIds={surface.scriptedIds}
                {...(chatId === undefined ? {} : { chatId })}
              />
            ) : (
              <PluginSurfaceRenderer
                anchor={anchor}
                pluginId={surface.pluginId}
                spec={surface.spec}
                surfaceId={surface.surfaceId}
                {...(chatId === undefined ? {} : { chatId })}
              />
            )}
          </PluginSurfaceShell>
        );
      })}
    </Stack>
  );
}
