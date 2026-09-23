// domain/plugin/substrate/ui-host-call-gate — the per-plugin CONCURRENCY belt on `plugin.uiHostCall`
// (the "flood" case). One process-wide counter, minted ONCE at compose beside the notify
// floor and the snippet gate (the same `ASSUMES(single-replica)` posture they carry).
//
// WHY A BELT AT ALL, given the tRPC bucket. The transport's authed per-user `general` bucket
// (`entry/rate-limit-gate.ts`) is what bounds calls per WINDOW, and it is the right instrument for that; it
// cannot express "how many of this plugin's host calls may be RUNNING AT ONCE", which is the bound that matters
// here because each in-flight call holds a real domain op — a db read, a KV write — for its whole duration. The
// server guest has exactly this belt for exactly this reason (`HOST_CALLS_IN_FLIGHT_MAX`, and its own header
// records that the counter must be per-INSTANCE and self-healing, learned the hard way when a reset drifted the
// count NEGATIVE and admitted 36 of a 40-call burst). Tier C opens a SECOND door onto the same ops from a
// surface that can re-render at animation rate, so it gets the same belt from birth rather than after the first
// flood — the D46 review's P2-F lesson ("the throttle applies to `invokeUiAction`/`uiHostCall` from birth").
//
// IT IS A COUNTER, NOT A QUEUE, and that is deliberate: the N+1 call is REFUSED with a typed error the guest
// can see and back off from, never parked. A queue here would convert a hostile flood into unbounded host
// memory, which is the failure the server-side FIFO's own depth bound exists to prevent.

import type { PluginId } from "@orb/kit/ids";
import type { UiHostCallGate } from "../contract/ops.ts";

/** Concurrent in-flight `uiHostCall`s per PLUGIN. MIRRORS `HOST_CALLS_IN_FLIGHT_MAX = 32` in
 *  `packages/server/src/infra/plugin-host/budgets.ts` — the same number, for the same reason (a legitimate guest
 *  fans a handful of reads at once; 32 is generous for that and small enough to bound host work), re-declared
 *  rather than imported because the cake bans the domain from value-importing infra (the identical situation
 *  `activation/crash-policy.ts` records for the crash threshold). The two are pinned equal by
 *  `tests/server/domain/plugin/substrate/ui-host-call-gate.test.ts`.
 *
 *  The SCOPE is the plugin, not the user, and not the surface: a plugin is what holds the grant, what the belt
 *  can be attributed to, and what a runaway `ui.js` is a property of. A per-user scope would let one plugin's
 *  loop starve a well-behaved sibling; a per-surface scope would multiply the ceiling by however many surfaces
 *  the plugin chose to register, which is the one number the attacker controls. */
export const UI_HOST_CALLS_IN_FLIGHT_MAX = 32;

/** Mint the process-wide gate — ONE per service at compose. The SEAM TYPE ({@link UiHostCallGate}) lives in
 *  `contract/service.ts` beside `SnippetGate` and `NotifyFloor`: the seam type in contract, the factory in
 *  substrate (§7.4's one type home, and the convention this domain's other two belts already follow). */
export function createUiHostCallGate(): UiHostCallGate {
  const inFlight = new Map<PluginId, number>();
  return {
    admit: (pluginId: PluginId): (() => void) => {
      const current = inFlight.get(pluginId) ?? 0;
      if (current >= UI_HOST_CALLS_IN_FLIGHT_MAX) {
        throw new Error(`plugin host: too many concurrent UI host calls (>${UI_HOST_CALLS_IN_FLIGHT_MAX}) — call refused`);
      }
      inFlight.set(pluginId, current + 1);
      // ONE release per acquisition, idempotent: a double-released slot would drift the counter DOWN and
      // eventually admit past the ceiling — the exact negative-drift defect the server-side counter's header
      // records (measured 2026-08-24: 36 of a 40-call burst admitted). The flag makes a stray second `finally`
      // harmless rather than corrupting.
      let released = false;
      return (): void => {
        if (released) {
          return;
        }
        released = true;
        const after = (inFlight.get(pluginId) ?? 1) - 1;
        if (after <= 0) {
          inFlight.delete(pluginId); // Never retain an entry for an idle plugin (the map is process-lifetime).
          return;
        }
        inFlight.set(pluginId, after);
      };
    },
  };
}
