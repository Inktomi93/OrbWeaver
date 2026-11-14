// domain/automation/engine/enabled-index — the watcher's in-process pre-check. The per-chat bus
// fires on every token-adjacent lifecycle beat; a DB probe per event on every chat is the wrong steady-state,
// so the watcher gates on an in-RAM Set<ChatId> of chats with ≥1 enabled rule + a flag for "any enabled
// domain-trigger rule anywhere" before it touches the DB. ASSUMES(single-replica) — the sets are per-process
// (the same annotation the chat replay ring + agents scheduler carry). Rebuilt at boot and after every lifecycle
// mutation that can change enablement (setRuleEnabled/deleteRule/updateRule call `refresh`).
//
// TWO REFRESH DOORS, because the two callers want opposite things from a failure. `reload` THROWS —
// it is the BOOT call, where a db that will not answer means the process must not come up pretending it has a
// pre-check. `refresh` never rejects — it is the post-mutation call, and by the time it runs the rule write
// has COMMITTED, so a throw would report failure for an operation that succeeded and leave the index stale
// with nobody knowing. Instead it latches STALE, both reads fail OPEN (every event pays one indexed query and
// canon decides), and the watcher front door rebuilds on the next event. All of it is PROCESS-LOCAL — the
// `ASSUMES(single-replica)` annotation covers the latch exactly as it covers the sets.

import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { EnabledRuleIndex } from "../contract/ops.ts";
import { hasEnabledDomainRules, loadEnabledChatIds } from "../persistence/rules.ts";

/** Build the pre-check index over `db`. Call `reload()` once at boot before the watcher subscribes. */
export function createEnabledRuleIndex(handle: DatabaseHandle, logger: Logger): EnabledRuleIndex {
  const db = databaseForOwner(handle);
  // ASSUMES(single-replica): a per-process snapshot, eventually-consistent within one reload of a mutation.
  let enabledChats = new Set<ChatId>();
  let domainRules = false;
  // The STALE latch. Set when a post-mutation refresh failed, cleared by the next successful one. It
  // is PROCESS-LOCAL like the sets it guards: nothing persists it, a respawn starts clean off a boot `reload`.
  let stale = false;

  const rebuild = async (): Promise<void> => {
    const [chatIds, hasDomain] = await Promise.all([loadEnabledChatIds(db), hasEnabledDomainRules(db)]);
    enabledChats = new Set(chatIds);
    domainRules = hasDomain;
    stale = false;
  };

  return {
    // WHILE STALE BOTH READS ANSWER TRUE, which is the "readers fall back to the DB" half: this index
    // is a pure OPTIMISATION over `loadEnabledChatRules`/`loadEnabledDomainRules`, so answering true costs one
    // indexed query per event and answering off a snapshot we KNOW is behind costs correctness — a deleted
    // rule that keeps dispatching, or an enabled one that never does. Fail OPEN, not fast.
    has: (chatId: ChatId): boolean => stale || enabledChats.has(chatId),
    hasDomainRules: (): boolean => stale || domainRules,
    isStale: (): boolean => stale,
    reload: rebuild,
    refresh: async (): Promise<void> => {
      // Ruled in `.claude/rules/server.md` (Lists, auth, events): a derived index rebuilt after a durable write must
      // not reject the write; latch it stale and let the bus retry. The caller is a verb whose durable write already
      // committed, so the failure is logged and latched: reads fail open (canon decides every event) until the
      // watcher front door's `healStaleIndexes` retry rebuilds it.
      try {
        await rebuild();
      } catch (error) {
        getLog(logger).warn({ err: error }, "automation: the enabled-rule index rebuild failed; reads fall back to the database until a retry succeeds");
        stale = true;
      }
    },
  };
}
