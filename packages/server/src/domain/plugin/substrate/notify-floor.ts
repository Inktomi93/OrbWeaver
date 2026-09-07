// domain/plugin/substrate/notify-floor — the `notify` capability's COOLDOWN, the one belt design 02 §2 pairs
// with the grant + participants-only recipients ("grant + host + participants-only recipients + the 60 s
// floor") that the plugin path shipped without. The RULE path enforces the same floor twice — at authoring
// (`substrate/validate.ts` refuses a `post_notification` rule with a smaller `cooldownSeconds`) and at fire
// time (`engine/budget-gate.ts`, off the fire log) — and both are unreachable for a plugin: a plugin has no
// rule row to constrain and no fire log to count. So the floor lives where the plugin's call does.
//
// WHY IT MATTERS MORE THAN "spam": every notice is a DURABLE row per present member, and `notifications.post`
// is one host call. The membrane's ≤32-in-flight cap is the only thing above it, and that cap bounds
// CONCURRENCY, never a rate — 32 at a time, as fast as they settle, forever. An unbounded per-call durable write
// behind that is a row flood, not a UX wart. (That cap used to be weaker still: it counted not-yet-timed-out
// promises rather than started work, so it admitted 32 FRESH calls every host-fn deadline while the previous
// ones were still running. Repaired 2026-08-24, P2-G — the reason this floor is written to be the real bound and
// not a second line behind a working one.)
//
// SCOPE, stated so it is not mistaken for more: the state is IN-MEMORY and per process (`ASSUMES(single-replica)`,
// the enabled-index / resident-registry precedent). A restart resets it. That is the honest bound for a
// spam/flood belt — a guest cannot restart the host, and the durable half of the posture (who may be notified
// at all) is the domain-resolved participants-only recipient set, which no cooldown state can weaken.

import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import type { NotifyFloor } from "../contract/ops.ts";

const MS_PER_SECOND = 1000;
const COOLDOWN_MS = AUTOMATION_NOTICE_COOLDOWN_SECONDS * MS_PER_SECOND;
/** The HARD ceiling on tracked (plugin × chat) pairs, and therefore the whole memory cost of this belt.
 *
 *  It is a cap with eviction and not merely a sweep threshold, because the sweep alone was not a bound: it
 *  only dropped entries whose cooldown had ELAPSED, so a plugin posting into many distinct rooms INSIDE one
 *  window swept nothing and the map grew one entry per room, without limit, driven by a guest. The lazy sweep
 *  is still the first move (a dead entry is free to drop and costs nobody a notice); eviction is what happens
 *  when the sweep does not get the size back under the cap.
 *
 *  THE COST, STATED: past the cap the LEAST-RECENTLY-ADMITTED pair is forgotten, so its next notice admits
 *  again. A guest can therefore buy itself one extra notice in a room by notifying 1024 other rooms first —
 *  which is a worse deal for it than simply waiting out the 60s, and the durable half of the posture (WHO may
 *  be notified at all: the domain-resolved participants-only recipient set) is untouched by any of it.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES = 1024;

/** Bring the map back under {@link PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES}: drop every entry whose cooldown has
 *  already elapsed (free — those pairs would admit anyway), then, only if that was not enough, EVICT from the
 *  front until there is room. A `Map` iterates in insertion order and `admit` re-inserts on every admitted
 *  post, so the front IS the least-recently-admitted pair. */
function reclaim(lastPostAt: Map<string, number>, at: number): void {
  if (lastPostAt.size < PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES) {
    return;
  }
  for (const [key, postedAt] of lastPostAt) {
    if (at - postedAt >= COOLDOWN_MS) {
      lastPostAt.delete(key);
    }
  }
  for (const key of lastPostAt.keys()) {
    if (lastPostAt.size < PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES) {
      break;
    }
    lastPostAt.delete(key);
  }
}

/** Build the process-wide plugin notice floor over an injected clock (the frozen clock in tests). */
export function createNotifyFloor(now: () => number): NotifyFloor {
  const lastPostAt = new Map<string, number>();
  return {
    admit: (pluginId, chatId): void => {
      const at = now();
      reclaim(lastPostAt, at);
      const key = `${pluginId}:${chatId}`;
      const previous = lastPostAt.get(key);
      if (previous !== undefined && at - previous < COOLDOWN_MS) {
        throw new Error(`plugin host: notifications.post is limited to one notice per ${AUTOMATION_NOTICE_COOLDOWN_SECONDS}s per chat`);
      }
      // DELETE-then-SET, not a bare set: the map's insertion order is the recency order the eviction above
      // reads, and a plain overwrite would leave a still-active pair sitting at the front to be evicted first.
      lastPostAt.delete(key);
      lastPostAt.set(key, at);
    },
  };
}
