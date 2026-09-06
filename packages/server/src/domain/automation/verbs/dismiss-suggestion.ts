// verb: dismissSuggestion — S4's HOST NO (interaction-direction-spec §3-S4). The same take-once claim as
// confirm, with nothing executed: the ask is gone from the store, so a second device showing the same card
// retires it the instant the `suggestionResolved` bus event lands (#700 — the host-only retirement twin of
// `suggestionRaised`) and a second dismiss refuses leak-free.
//
// WHY IT IS A SERVER VERB AND NOT A CLIENT-SIDE HIDE: a dismissed ask must actually DIE. If dismissal were
// local state, the record would sit in the store until its TTL, the host's other tab would keep offering it,
// and — because the store replaces per `(chatId, ruleId)` — the rule's next fire would silently be
// "answered" by a card the host already said no to. Dismiss is an answer, and answers are server-side.
//
// The gate is the same as confirm's, and deliberately so: a card is host-tier, so dismissing one is a host
// act. A non-present member collapses onto the ask's own leak-free not-found.

import type { Principal } from "@orb/contracts/identity";
import { SuggestionNotFoundError } from "../contract/errors.ts";
import type { PendingSuggestion } from "../contract/ops.ts";
import type { DismissSuggestionParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { loadCallerRole } from "../persistence/canon-reads.ts";

/** Host-gate the ask's own chat (the confirm verb's twin — one behavior, spelled where each verb reads). */
async function requireSuggestionHost(ctx: AutomationContext, principal: Principal, pending: PendingSuggestion): Promise<void> {
  const role = await loadCallerRole(ctx.db, pending.chatId, principal.userId);
  if (role === undefined) {
    throw new SuggestionNotFoundError(pending.id);
  }
  ctx.can(principal, "host", { kind: "chat", membership: { role } });
}

export function createDismissSuggestion(ctx: AutomationContext): AutomationService["dismissSuggestion"] {
  return async ({ principal, suggestionId }: DismissSuggestionParams): Promise<void> => {
    const nowMs = ctx.now();
    const seen = ctx.suggestions.peek(suggestionId, nowMs);
    if (seen === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    await requireSuggestionHost(ctx, principal, seen);
    if (ctx.suggestions.drop(suggestionId, nowMs) === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    // #700 — the drop removed the ask from the store, so retire the card on every attached host tab. The
    // acting tab drops it optimistically via the mutation's onSuccess; this host-only event is the only
    // retirement channel for the host's OTHER tabs/devices (no query, no replay on this live-only room).
    ctx.notify({ type: "suggestionResolved", chatId: seen.chatId, suggestionId });
  };
}
