// domain/automation/substrate/enabled-index — the watcher's in-process pre-check. The per-chat bus
// fires on every token-adjacent lifecycle beat; a DB probe per event on every chat is the wrong steady-state,
// so the watcher gates on an in-RAM Set<ChatId> of chats with ≥1 enabled rule + a flag for "any enabled
// domain-trigger rule anywhere" before it touches the DB. ASSUMES(single-replica) — the sets are per-process
// (the same annotation the chat replay ring + agents scheduler carry). Rebuilt at boot and after every lifecycle
// mutation that can change enablement (setRuleEnabled/deleteRule/updateRule call `refresh`).
//
// TWO REFRESH DOORS, because the two callers want opposite things from a failure (#1431). `reload` THROWS —
// it is the BOOT call, where a db that will not answer means the process must not come up pretending it has a
// pre-check. `refresh` never rejects — it is the post-mutation call, and by the time it runs the rule write
// has COMMITTED, so a throw would report failure for an operation that succeeded and leave the index stale
// with nobody knowing. Instead it latches STALE, both reads fail OPEN (every event pays one indexed query and
// canon decides), and the watcher front door rebuilds on the next event. All of it is PROCESS-LOCAL — the
// `ASSUMES(single-replica)` annotation covers the latch exactly as it covers the sets.

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { EnabledRuleIndex } from "../contract/ops.ts";
import { hasEnabledDomainRules, loadEnabledChatIds } from "../persistence/rules.ts";

/** Build the pre-check index over `db`. Call `reload()` once at boot before the watcher subscribes. */
export function createEnabledRuleIndex(db: Db): EnabledRuleIndex {
  // ASSUMES(single-replica): a per-process snapshot, eventually-consistent within one reload of a mutation.
  let enabledChats = new Set<ChatId>();
  let domainRules = false;
  // #1431 — the STALE latch. Set when a post-mutation refresh failed, cleared by the next successful one. It
  // is PROCESS-LOCAL like the sets it guards: nothing persists it, a respawn starts clean off a boot `reload`.
  let stale = false;

  const rebuild = async (): Promise<void> => {
    const [chatIds, hasDomain] = await Promise.all([loadEnabledChatIds(db), hasEnabledDomainRules(db)]);
    enabledChats = new Set(chatIds);
    domainRules = hasDomain;
    stale = false;
  };

  return {
    // WHILE STALE BOTH READS ANSWER TRUE, which is the "readers fall back to the DB" half of #1431: this index
    // is a pure OPTIMISATION over `loadEnabledChatRules`/`loadEnabledDomainRules`, so answering true costs one
    // indexed query per event and answering off a snapshot we KNOW is behind costs correctness — a deleted
    // rule that keeps dispatching, or an enabled one that never does. Fail OPEN, not fast.
    has: (chatId: ChatId): boolean => stale || enabledChats.has(chatId),
    hasDomainRules: (): boolean => stale || domainRules,
    isStale: (): boolean => stale,
    reload: rebuild,
    refresh: async (): Promise<void> => {
      // @orb-waive caught-failure-ownership(catch): DELIBERATE ABSORBER. The owner is the STALE
      // LATCH below plus the watcher front door's `healStaleIndexes` retry: the failure is surfaced as
      // fail-open reads (canon decides every event) and cleared by the next successful rebuild. Propagating
      // instead is the #1431 defect — it rejects a verb whose durable write already committed. Ends when the
      // enabled index stops being a pure optimisation over `loadEnabledChatRules`.
      try {
        await rebuild();
      } catch {
        // SWALLOWED DELIBERATELY, and this is the whole point of the seam: the caller is a verb whose DURABLE
        // write already committed. Rejecting here would tell a host their edit failed while the row says
        // otherwise. The latch above makes the index honest until the next refresh succeeds; the watcher front
        // door retries on the next event it sees.
        stale = true;
      }
    },
  };
}
