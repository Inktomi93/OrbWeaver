// domain/plugin/substrate/rate-floor — the per-plugin HOURLY call floor: the belt that bounds a RATE, for the
// membrane capabilities whose per-call bounds do not add up to one.
//
// WHY A RATE BELT EXISTS AT ALL, and why the existing caps are not it. Every other bound in the sandbox is
// PER CALL or PER INSTANCE: `safeFetch` bounds one request (deadline, byte cap, redirect budget), the manifest
// bounds the DESTINATION set, the side-gen posture bounds one generation's output, and
// `HOST_CALLS_IN_FLIGHT_MAX` bounds how many host calls run AT ONCE. None of those is a rate. Thirty-two at a
// time, as fast as they settle, forever, is a perfectly legal reading of all of them together — and for a
// plugin subscribed to `messageCommitted` that is one external egress (or one paid generation) per committed
// message, unbounded. The D46 security review recorded exactly this for `net.fetch`
// ("no per-plugin fetch counter anywhere in `infra/network/egress.ts` or the membrane"); `llm.quiet` would have
// shipped with the same hole and a credit card attached.
//
// THE BELT IS ON THE RESOURCE, NOT ON THE AMPLIFIER. The obvious alternative — throttle event DELIVERY, since
// that is what makes the loop spin — is wrong on both ends: it misses the identical egress/generation reachable
// from a resident tool handler or a D50 transform apply, and it throttles legitimate non-egress work (a plugin
// that only writes its own KV per event). Bounding what actually costs something is both narrower and
// stricter.
//
// KEYED PER PLUGIN, and that is the meaningful unit: a `plugins` row is unique per (owner, slug), so a
// per-plugin ceiling is already per-owner, and one plugin's abuse can never consume another's budget.
//
// SCOPE, stated so it is not mistaken for more (the notify-floor / resident-registry posture): the state is
// IN-MEMORY and per process (`ASSUMES(single-replica)`). A restart resets it. That is the honest bound for a
// flood belt — a guest cannot restart the host — and the DURABLE halves of each capability's posture (which
// hosts `net.fetch` may reach; whose credential `llm.quiet` spends) are enforced elsewhere and no counter
// state can weaken them.
//
// THE WINDOW IS A FIXED BUCKET, not a sliding one, and the choice is deliberate: a sliding window needs a
// timestamp per call (unbounded memory per plugin within the hour) to bound a number this coarse. The
// accepted cost is the boundary burst — up to 2×limit across an hour boundary — which is the right direction
// to be imprecise in for a ceiling nobody legitimate approaches.

import type { PluginId } from "@orb/kit/ids";
import type { PluginRateFloor } from "../contract/ops.ts";

const MS_PER_HOUR = 3_600_000;

/** `net.fetch` calls per plugin per hour. One every 10 seconds sustained — above any human browse cadence
 *  (a hub plugin's searches, page flips and detail opens are all one text call each, and the original 120
 *  was reachable by a page-flipping binge — #801's "fix slowness, don't degrade" ruling), while still
 *  bounding an exfiltration loop on the POST-capable channel to something an operator can see in the log
 *  ring. Art does NOT ride this belt (see {@link PLUGIN_ASSET_EGRESS_PER_HOUR}). */
export const PLUGIN_EGRESS_PER_HOUR = 360;

/** `net.fetchAsset` calls per plugin per hour — the #801 belt SPLIT. The asset arm shared `net.fetch`'s belt
 *  when #798 landed, and the sharing was the defect: an art hub honestly spends ~30 covers per fresh browse
 *  page, so art starved search inside an hour and the cache degenerated into rationing. The channels also
 *  price differently — `fetchAsset` is GET-only to the manifest allowlist and its product lands in the
 *  installer's OWN CAS (the outbound bytes are one URL), while `net.fetch` can carry a POST body out (the
 *  D46 exfil pricing that keeps ITS ceiling tight). 1200/hour ≈ 40 fresh uncached pages of covers an hour;
 *  repeats are free (content-addressed CAS + the plugin-side cache), and the per-call byte/image caps and
 *  the assets-GC bound what a runaway loop can accrete. */
export const PLUGIN_ASSET_EGRESS_PER_HOUR = 1200;

/** `llm.quiet` generations per plugin per hour. Tighter than egress because each call is REAL SPEND on the
 *  installer's own credential, and a plugin that needs a model call on more than one message in two is not a
 *  plugin, it is a co-author. */
export const PLUGIN_QUIET_LLM_PER_HOUR = 30;

/** Semantic queries may embed through the installer's hosted, paid connection. Two a minute sustained is a
 *  generous interactive library-search cadence, while an event-driven loop would otherwise spend without a
 *  ceiling. This is its own per-plugin budget: retrieval is cheaper than `llm.quiet` generation and must not
 *  starve the separate `net.fetch` browse budget. The fixed-window boundary can admit 240 across two hours. */
export const PLUGIN_SEARCH_QUERY_PER_HOUR = 120;

/** Sweep threshold — one entry per plugin that has ever used the capability in this process, each dead after
 *  its window. A bounded lazy sweep keeps a long-lived process from accumulating rows for uninstalled plugins
 *  (the notify-floor precedent; a timer would read the wall clock in a domain whose every other time read is
 *  injected, and would hold a process handle open for a map allowed to be empty). */
const SWEEP_AT_ENTRIES = 1024;

/** One plugin's current fixed window. */
interface Window {
  startedAt: number;
  count: number;
}

/**
 * Build a process-wide per-plugin hourly floor over an INJECTED clock (a frozen clock in tests — the
 * `test-determinism` seam, so a suite advances the window rather than sleeping through it).
 *
 * `admit` is ONE synchronous check-and-claim step, deliberately: the membrane admits up to
 * `HOST_CALLS_IN_FLIGHT_MAX` concurrent host calls per instance, so a check that returned a verdict and let the
 * caller await the work before recording would let a burst all observe the pre-burst count. Same reason
 * `NotifyFloor.admit` and `SnippetGate.admit` are single-step.
 *
 * `capability` names the axis in the refusal so a plugin author reads which ceiling they hit, and `limit`
 * appears in the message because a ceiling you cannot see is one you cannot design around.
 */
export function createPluginRateFloor(now: () => number, spec: { readonly capability: string; readonly limit: number }): PluginRateFloor {
  const windows = new Map<PluginId, Window>();
  return {
    admit: (pluginId): void => {
      const at = now();
      if (windows.size >= SWEEP_AT_ENTRIES) {
        for (const [key, window] of windows) {
          if (at - window.startedAt >= MS_PER_HOUR) {
            windows.delete(key);
          }
        }
      }
      const current = windows.get(pluginId);
      if (current === undefined || at - current.startedAt >= MS_PER_HOUR) {
        windows.set(pluginId, { startedAt: at, count: 1 });
        return;
      }
      if (current.count >= spec.limit) {
        throw new Error(`plugin host: ${spec.capability} is limited to ${spec.limit} calls per hour for this plugin`);
      }
      // Claimed. The increment is the RECORD half of check-and-claim and happens before any caller await.
      current.count += 1;
    },
  };
}
