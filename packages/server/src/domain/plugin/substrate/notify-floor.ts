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
/** Sweep threshold — the key set is (plugin × chat) and every entry is dead after the cooldown, so a bounded
 *  lazy sweep keeps a long-lived process from accumulating one entry per room a plugin ever notified. */
const SWEEP_AT_ENTRIES = 1024;

/** Build the process-wide plugin notice floor over an injected clock (the frozen clock in tests). */
export function createNotifyFloor(now: () => number): NotifyFloor {
  const lastPostAt = new Map<string, number>();
  return {
    admit: (pluginId, chatId): void => {
      const at = now();
      if (lastPostAt.size >= SWEEP_AT_ENTRIES) {
        for (const [key, postedAt] of lastPostAt) {
          if (at - postedAt >= COOLDOWN_MS) {
            lastPostAt.delete(key);
          }
        }
      }
      const key = `${pluginId}:${chatId}`;
      const previous = lastPostAt.get(key);
      if (previous !== undefined && at - previous < COOLDOWN_MS) {
        throw new Error(`plugin host: notifications.post is limited to one notice per ${AUTOMATION_NOTICE_COOLDOWN_SECONDS}s per chat`);
      }
      lastPostAt.set(key, at);
    },
  };
}
