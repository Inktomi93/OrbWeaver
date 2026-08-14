// domain/automation/substrate/enabled-index — the watcher's in-process pre-check. The per-chat bus
// fires on every token-adjacent lifecycle beat; a DB probe per event on every chat is the wrong steady-state,
// so the watcher gates on an in-RAM Set<ChatId> of chats with ≥1 enabled rule + a flag for "any enabled
// domain-trigger rule anywhere" before it touches the DB. ASSUMES(single-replica) — the sets are per-process
// (the same annotation the chat replay ring + agents scheduler carry). Rebuilt at boot and after every lifecycle
// mutation that can change enablement (setRuleEnabled/deleteRule/updateRule call `reload`).

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { EnabledRuleIndex } from "../contract/ops.ts";
import { hasEnabledDomainRules, loadEnabledChatIds } from "../persistence/rules.ts";

/** Build the pre-check index over `db`. Call `reload()` once at boot before the watcher subscribes. */
export function createEnabledRuleIndex(db: Db): EnabledRuleIndex {
  // ASSUMES(single-replica): a per-process snapshot, eventually-consistent within one reload of a mutation.
  let enabledChats = new Set<ChatId>();
  let domainRules = false;
  return {
    has: (chatId: ChatId): boolean => enabledChats.has(chatId),
    hasDomainRules: (): boolean => domainRules,
    reload: async (): Promise<void> => {
      const [chatIds, hasDomain] = await Promise.all([loadEnabledChatIds(db), hasEnabledDomainRules(db)]);
      enabledChats = new Set(chatIds);
      domainRules = hasDomain;
    },
  };
}
