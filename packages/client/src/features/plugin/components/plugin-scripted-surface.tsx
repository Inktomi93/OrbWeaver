// plugin-scripted-surface — the MOUNT for a Tier-C surface (plugin-ui-plane #679 U4, §4.6). It is the seam
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
// FAILURE IS SILENCE (§4.9). No spinner while it boots, no error card when it dies: a surface with no tree
// renders `null`, exactly like a Tier-S surface with nothing published, so a broken plugin costs a room
// nothing but its own absence. The person's answer to "where did my widget go" is the plugin log — and the
// crash also feeds the 3-strike policy, so a plugin that dies every mount disables itself rather than
// flickering forever.

import type { PluginCapability, PluginSurfaceAnchor, PluginSurfaceSpec } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { fetchPluginUiSource, useInvalidation, useTRPC, useTRPCClient } from "#data";
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
}

export function PluginScriptedSurface({ pluginId, anchor, surfaceId, surfaceIds, grants, chatId }: PluginScriptedSurfaceProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reportCrash = useReportUiCrash({ trpc, invalidation });
  // The IMPERATIVE client: a host call is driven by the GUEST, not by a render, so it has no query key, no
  // cache entry and nothing to invalidate — `useMutation` would be the wrong instrument for a call whose result
  // goes straight back into an interpreter.
  const client = useTRPCClient();
  const [tree, setTree] = useState<PluginSurfaceSpec | null>(null);
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
  // The per-render handles the boot's CALLBACKS need, read through a ref so they are not boot dependencies.
  // Written in an EFFECT, never during render (the refs-render ban).
  const latest = useRef({ reportCrash, client, chatId });
  useEffect(() => {
    latest.current = { reportCrash, client, chatId };
  });

  useEffect(() => {
    let cancelled = false;
    // The dynamic import is INSIDE the effect, not at module scope: that is what keeps the interpreter and its
    // WASM out of every other chunk. `Promise.all` so the ~1 MiB engine and the source download overlap.
    const boot = async (): Promise<void> => {
      const [{ startPluginUiGuest }, source] = await Promise.all([import("../lib/ui-guest/plugin-ui-guest-host.ts"), fetchPluginUiSource(pluginId)]);
      if (cancelled || source === null) {
        return;
      }
      guestRef.current = startPluginUiGuest({
        source,
        // Reconstructed from the boot keys — see the note above them.
        grants: grantsKey === "" ? [] : grantsKey.split(","),
        surfaceIds: surfaceIdsKey === "" ? [] : surfaceIdsKey.split(","),
        events: {
          onTree: (published, next): void => {
            // Only THIS surface's trees. One worker serves every scripted surface a plugin registered, so a
            // sibling's publication must not repaint this mount.
            if (published === surfaceId) {
              setTree(next);
            }
          },
          onCrash: (reason): void => {
            // COLLAPSE, then REPORT — in that order, because the person's room must stop showing a dead widget
            // whether or not the report reaches the server.
            setTree(null);
            latest.current.reportCrash.mutate({ pluginId, surfaceId, reason });
          },
          onLog: (): void => {
            // Guest log lines ride the plugin's own runtime log surface (#627). Deliberately NOT the browser
            // console: an untrusted guest must not be able to write into the host's diagnostic channel.
          },
          onHostCall: async (fn, argsJson): Promise<string> => {
            // THE ONE WIRE. Everything the guest can reach goes through this proc, and the SERVER re-gates it
            // per call (owner scope, the closed proxyable tuple, the stored grant, room membership). Nothing is
            // decided here — the client's view of its own grants is display-only by design.
            const now = latest.current;
            const result = await now.client.plugin.uiHostCall.mutate({
              pluginId,
              fn,
              argsJson,
              ...(now.chatId === undefined ? {} : { chatId: now.chatId }),
            });
            return result.resultJson;
          },
        },
      });
    };
    // @orb-waive caught-failure-ownership(boot): "FAILURE IS SILENCE (§4.9)" is the file header's
    // stated design law — a surface with no tree renders null exactly like a Tier-S surface with nothing
    // published, and a crash still feeds reportCrash + the 3-strike policy. Ends if that law is retired.
    void boot().catch(() => undefined);
    return (): void => {
      cancelled = true;
      guestRef.current?.dispose();
      guestRef.current = null;
    };
    // The BOOT IDENTITY (see the keys above). `chatId` is deliberately NOT here: a room switch changes where a
    // proxied host call is scoped, and the call reads the CURRENT room off the ref — it does not change what
    // the guest IS, so re-booting an interpreter over it would throw away a person's filter state every time
    // they moved rooms.
  }, [pluginId, surfaceId, grantsKey, surfaceIdsKey]);

  if (tree === null) {
    // SILENT until the guest has something to say (§4.9) — the same `null` a bound Tier-S surface renders
    // before its first publish, which is what keeps a plugin-less/pre-boot room byte-identical.
    return null;
  }
  return (
    <PluginSurfaceRenderer
      anchor={anchor}
      pluginId={pluginId}
      sink={{
        state: {},
        submit: (actionId, values): void => guestRef.current?.deliverEvent(surfaceId, { type: "action", actionId }, values),
        onFieldChange: (name, value): void => guestRef.current?.deliverEvent(surfaceId, { type: "field", name, value }, { [name]: value }),
      }}
      spec={tree}
      surfaceId={surfaceId}
      {...(chatId === undefined ? {} : { chatId })}
    />
  );
}
