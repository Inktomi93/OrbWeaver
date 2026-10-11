// The caller's chat-anchor registrations that are showing right now — the one read both the fan-out and the
// phone's sheet trigger take, so the trigger's icon appears exactly when the sheet would hold something.

import type { PluginCapability, PluginSurfaceAnchor, PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { specBindsState } from "../lib/plugin-surface-bindings.ts";
import { usePluginChatVisibility } from "./use-plugin-chat-visibility.ts";

/** The two wire reads this fan-out joins, tRPC-INFERRED — so a reshape of either breaks here at compile time
 *  rather than at a runtime `undefined`. */
type PluginSurfaceView = inferOutput<Trpc["plugin"]["listSurfaces"]>[number];
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

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
export function buildCandidates(surfaces: readonly PluginSurfaceView[], plugins: readonly PluginView[], anchor: PluginSurfaceAnchor): RenderableSurface[] {
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

/** The registrations of `anchor` that are showing right now: the caller's enabled plugins' surfaces, less the
 *  plugins this user hid from chat, less a bound static surface whose plugin has published nothing yet. The phone's
 *  sheet trigger reads the same list, so its icon appears exactly when the sheet would hold something. */
export function useVisibleAnchoredSurfaces(anchor: PluginSurfaceAnchor, chatId: ChatId | undefined): readonly RenderableSurface[] {
  const trpc = useTRPC();
  // `listSurfaces` is the caller's OWN enabled plugins' registrations (owner-scoped server-side, and a disabled
  // plugin has no resident instance, so it contributes nothing) — the v1 invariant is viewer == installer.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const { isHidden } = usePluginChatVisibility();
  // A hidden plugin is dropped BEFORE its state is read: nothing about it mounts or fetches while it is hidden.
  const candidates = buildCandidates(surfaces ?? [], plugins ?? [], anchor).filter((candidate) => !isHidden(candidate.pluginId));

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
  return candidates.filter((candidate, index) => candidate.tier !== "static" || !specBindsState(candidate.spec) || (states[index]?.data ?? null) !== null);
}
