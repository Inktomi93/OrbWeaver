// plugin-scripted-surface — the MOUNT for a Tier-C surface. It is the seam
// between React and the worker guest: fetch the `ui.js` bytes, start a guest lazily, hold whatever tree the
// guest last published, and route interactions back INTO it.
//
// THE THREE LOADS ARE ALL LAZY, and the laziness is a stated law rather than an optimisation:
//  1. the QuickJS WASM (~1 MiB) and the guest host module ride a DYNAMIC import inside the effect, so they are
//     in their own chunk and NEVER in the boot chunk (the #43/#433 boot-split law,
//     `client-architecture-lockdown.md` §7). A person with no scripted plugin pays nothing.
//  2. the `ui.js` source is fetched from the owner-gated bytes route only once a surface is actually mounted.
//  3. the WORKER itself is spawned only after both land.
//
// ZERO NETWORK ON KEYSTROKE — the owner's own U4 test — is a property of what this component does NOT do once
// it is running: every field change and every button goes through `guest.deliverEvent`, which is a
// `postMessage`. There is no query, no mutation, no invalidation on that path. The only thing that can put a
// request on the wire afterwards is the GUEST asking for host data, which a local filter never does.
//
// D268 splits the host posture by placement. A selected page or open dialog owns visible space, so it shows
// booting, confirmed empty, content, and failed-with-Retry states inside its attribution shell. Optional anchors
// stay silent without a tree. Tool cards keep their generic persisted record because transcript canon cannot
// disappear. A crash still feeds the 3-strike policy, so repeated failure disables the plugin.

import type { PluginCapability, PluginSurfaceAnchor, PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { fetchPluginUiSource, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { usePluginHostCall } from "../hooks/use-plugin-host-call.ts";
import { useReportUiCrash } from "../lib/plugin-mutations.ts";
import type { PluginUiGuest } from "../lib/ui-guest/plugin-ui-guest-host.ts";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";

export interface PluginScriptedSurfaceProps {
  readonly pluginId: PluginId;
  /** WHERE this surface is mounted (#818) — passed straight through to the renderer, which needs it to
   *  arbitrate a `primary` button. Tier C changes WHO COMPUTES the tree, never where it hangs. */
  readonly anchor: PluginSurfaceAnchor;
  /** THIS surface's id. The guest may own several; only trees published for this one land here. */
  readonly surfaceId: string;
  /** Every scripted surface id this plugin registered — the guest's render allow-list (a `render` naming
   *  anything else is dropped worker-side). */
  readonly surfaceIds: readonly string[];
  /** The plugin's granted capabilities, for the guest's feature-detection surface. Display-only — the server
   *  re-gates every host call against the stored row, so this array is a convenience, never an authority. */
  readonly grants: readonly PluginCapability[];
  /** The room this surface is mounted in (row 777), threaded into every proxied chat-scoped host call. */
  readonly chatId?: ChatId;
  /** Canonical host content retained while the guest has no tree. Tool cards use their generic call record. */
  readonly fallback?: ReactElement;
  /** Host-owned binding state for a per-call surface. Tool cards bind against their persisted call record. */
  readonly state?: Record<string, unknown>;
}

type ScriptedSurfaceState =
  | { readonly bootKey: string; readonly kind: "booting" }
  | { readonly bootKey: string; readonly kind: "ready-empty" }
  | { readonly bootKey: string; readonly kind: "ready-tree"; readonly tree: PluginSurfaceSpec }
  | { readonly bootKey: string; readonly kind: "failed" };

export function PluginScriptedSurface({
  pluginId,
  anchor,
  surfaceId,
  surfaceIds,
  grants,
  chatId,
  fallback,
  state: bindingState,
}: PluginScriptedSurfaceProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reportCrash = useReportUiCrash({ trpc, invalidation });
  // The shared relay, bound to THIS mount's plugin and room (`use-plugin-host-call.ts`).
  const hostCall = usePluginHostCall(pluginId, chatId);
  const [attempt, setAttempt] = useState(0);
  const guestRef = useRef<PluginUiGuest | null>(null);

  // THE BOOT IDENTITY. A guest is expensive (a ~1 MiB WASM instantiation) and STATEFUL — holding local state
  // between interactions is its entire point — so it must be re-booted only when something it was built FROM
  // actually changed. The two arrays are carried as JOINED STRINGS, and the effect reconstructs them: a
  // re-render hands new array identities every time, and depending on those would respawn the guest on every
  // parent paint, losing a person's filter state and re-paying the WASM boot. The join is lossless because
  // both vocabularies are comma-free by grammar (a `PluginCapability` member; a surface id, /^[a-z][a-z0-9_]*$/).
  // A real grant/surface CHANGE does move these keys, and a respawn is then correct — the guest's
  // feature-detection surface is stale.
  const grantsKey = grants.join(",");
  const surfaceIdsKey = surfaceIds.join(",");
  const bootKey = `${pluginId}:${surfaceId}:${grantsKey}:${surfaceIdsKey}:${String(attempt)}`;
  const [state, setState] = useState<ScriptedSurfaceState>({ bootKey, kind: "booting" });
  if (state.bootKey !== bootKey) {
    setState({ bootKey, kind: "booting" });
  }
  const renderedState: ScriptedSurfaceState = state.bootKey === bootKey ? state : { bootKey, kind: "booting" };
  // The per-render handles the boot's CALLBACKS need, read through a ref so they are not boot dependencies.
  // Written in an EFFECT, never during render (the refs-render ban).
  const latest = useRef({ reportCrash, hostCall });
  useEffect(() => {
    latest.current = { reportCrash, hostCall };
  });

  useEffect(() => {
    let cancelled = false;
    // The dynamic import is INSIDE the effect, not at module scope: that is what keeps the interpreter and its
    // WASM out of every other chunk. `Promise.all` so the ~1 MiB engine and the source download overlap.
    const boot = async (): Promise<void> => {
      const [{ startPluginUiGuest }, source] = await Promise.all([import("../lib/ui-guest/plugin-ui-guest-host.ts"), fetchPluginUiSource(pluginId)]);
      if (cancelled) {
        return;
      }
      if (source === null) {
        setState((current) => (current.bootKey === bootKey ? { bootKey, kind: "failed" } : current));
        return;
      }
      guestRef.current = startPluginUiGuest({
        source,
        // Reconstructed from the boot keys — see the note above them.
        grants: grantsKey === "" ? [] : grantsKey.split(","),
        surfaceIds: surfaceIdsKey === "" ? [] : surfaceIdsKey.split(","),
        events: {
          onReady: (): void => {
            setState((current) => (current.bootKey !== bootKey || current.kind === "ready-tree" ? current : { bootKey, kind: "ready-empty" }));
          },
          onTree: (published, next): void => {
            // Only THIS surface's trees. One worker serves every scripted surface a plugin registered, so a
            // sibling's publication must not repaint this mount.
            if (published === surfaceId) {
              setState((current) => (current.bootKey === bootKey ? { bootKey, kind: "ready-tree", tree: next } : current));
            }
          },
          onCrash: (reason): void => {
            // COLLAPSE, then REPORT — in that order, because the person's room must stop showing a dead widget
            // whether or not the report reaches the server.
            setState((current) => (current.bootKey === bootKey ? { bootKey, kind: "failed" } : current));
            latest.current.reportCrash.mutate({ pluginId, surfaceId, reason });
          },
          onLog: (): void => {
            // Guest log lines ride the plugin's own runtime log surface (#627). Deliberately NOT the browser
            // console: an untrusted guest must not be able to write into the host's diagnostic channel.
          },
          // THE ONE WIRE. Everything the guest can reach goes through this proc, and the SERVER re-gates it per
          // call (owner scope, the closed proxyable tuple, the stored grant, room membership). Nothing is decided
          // here; the client's view of its own grants is display-only by design. Read off the ref so a call
          // always goes out under the CURRENT room.
          onHostCall: (fn, argsJson): Promise<string> => latest.current.hostCall(fn, argsJson),
        },
      });
    };
    void boot().catch((error: unknown) => {
      // A stale mount cannot paint a failure, but its rejected load still reaches the operator.
      globalThis.reportError(error);
      if (!cancelled) {
        setState((current) => (current.bootKey === bootKey ? { bootKey, kind: "failed" } : current));
      }
    });
    return (): void => {
      cancelled = true;
      guestRef.current?.dispose();
      guestRef.current = null;
    };
    // The BOOT IDENTITY (see the keys above). `chatId` is deliberately NOT here: a room switch changes where a
    // proxied host call is scoped, and the call reads the CURRENT room off the ref — it does not change what
    // the guest IS, so re-booting an interpreter over it would throw away a person's filter state every time
    // they moved rooms.
  }, [pluginId, surfaceId, grantsKey, surfaceIdsKey, bootKey]);

  const selected = anchor === "page" || anchor === "dialog";
  if (!selected && renderedState.kind !== "ready-tree") {
    return fallback ?? null;
  }
  if (renderedState.kind === "booting") {
    return (
      <Stack gap="block" role="status">
        <Text voice="label">Loading plugin content…</Text>
        <SkeletonRows count={2} shape="line" />
      </Stack>
    );
  }
  if (renderedState.kind === "failed") {
    return <QueryErrorState label="this plugin content" onRetry={(): void => setAttempt((current) => current + 1)} />;
  }
  if (renderedState.kind === "ready-empty") {
    return (
      <Stack gap="field">
        <Text prose={true} voice="gloss">
          This plugin has no content to show here yet.
        </Text>
        <Button intent="ghost" onClick={(): void => setAttempt((current) => current + 1)} size="sm">
          Reload
        </Button>
      </Stack>
    );
  }
  return (
    <PluginSurfaceRenderer
      anchor={anchor}
      pluginId={pluginId}
      sink={{
        state: bindingState ?? {},
        submit: (actionId, values): void => guestRef.current?.deliverEvent(surfaceId, { type: "action", actionId }, values),
        onFieldChange: (name, value): void => guestRef.current?.deliverEvent(surfaceId, { type: "field", name, value }, { [name]: value }),
      }}
      spec={renderedState.tree}
      surfaceId={surfaceId}
      {...(chatId === undefined ? {} : { chatId })}
    />
  );
}
