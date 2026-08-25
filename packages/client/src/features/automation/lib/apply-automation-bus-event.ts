// THE CLIENT TOTAL MAP over `AutomationBusEvent` — the consumer-exhaustiveness belt this bus never had.
//
// Until A4 the automation bus had a producer belt (`AUTOMATION_BUS_EVENT_TYPES`) and NO client consumer at
// all, so `bus-definition-belts` carried it on the SERVER_INTERNAL_REACH lane with a row that named its own
// end condition: "ends the moment the quick-reply chips UI lands — the map becomes buildable, this row goes
// RED, and it gets deleted." The S4 card is that consumer; the row is deleted; this is the map.
//
// It is a REDUCER, not an invalidation seam, because this bus has nothing to invalidate: the automation room
// is live-only (no cursor, no replay — `transport/trpc/stream/sources/automation.ts`) and a pending ask has
// no query behind it. So the map's job is to fold events into the ask list the card source renders.
//
// The three arms that DO something, and why the other three honestly do not:
//   • suggestionRaised   — the ask itself. Replace-per-`(chatId, SOURCE)` MIRRORS the server store's own
//                          rule (RULED F1): a cadence rule that keeps firing keeps ONE live ask, so the
//                          band's one-visible-card budget stays bounded by ORIGIN count. Without the mirror
//                          the client would stack N cards for a rule the server holds one ask for, and the
//                          "+N pending" count would be a lie. The source is a union, not a rule id, because
//                          PLUGINS raise asks too (they joined the three-posture law post-#24) — and a plugin
//                          has no rule, so a synthetic id would be a lie in the key.
//   • suggestionResolved — the ask was ANSWERED (confirm or dismiss) and left the server store; drop the
//                          matching card here so every attached host tab retires it, not just the acting one
//                          (#700). Id-keyed, not source-keyed: a resolve names the exact ask that left, so a
//                          rule's newer live ask outlives its older answered one. Without this member a card
//                          on the host's OTHER tab/device sat dead until TTL (30 min) — no query, no replay.
//   • ruleAutoDisabled   — the server VOIDED that rule's asks (the 20-error ceiling); drop them here too.
//   • quickReplySurfaced — the member-visible CHIPS. Not this source's: chips are B3's row, published by
//                          its own control source into the same band. Folding them here would put two
//                          owners on one control kind.
//   • ruleFired / ruleErrored / rulesChanged — host FIRE-LOG signal. B2's rules panel is their consumer;
//                          neither moves a pending ask.

import type { AutomationBusEvent, AutomationEmitSource, AutomationSuggestionKind, SuggestionCardDetail } from "@orb/contracts/automation";
import type { AutomationSuggestionId, ChatId } from "@orb/kit/ids";

/** One pending ask as the card renders it — the bus payload, kept whole. There is no fuller shape to fetch:
 *  the record itself is in the server's RAM and never crosses as anything but this. */
export interface PendingAsk {
  readonly id: AutomationSuggestionId;
  /** WHO is asking — a rule the host wrote, or an INSTALLED PLUGIN (plugins joined the same three-posture law
   *  post-#24). The same `AutomationEmitSource` the chips carry, and the same replace-per-kind key the server
   *  stores under, so this fold and that store agree about which card a new ask replaces. */
  readonly source: AutomationEmitSource;
  readonly chatId: ChatId;
  readonly kind: AutomationSuggestionKind;
  readonly summary: string;
  readonly expiresAt: number;
  /** The optional structured body (C3's rewrite before/after). Absent ⇒ the card is title + actions. */
  readonly detail?: SuggestionCardDetail;
}

/** The replace-per-kind key, MIRRORING the server's `slotKey`: one live card per origin. The prefix keeps the
 *  two id namespaces from colliding on a shared string — the same reason the server's key carries it. ONE
 *  home for the namespace grammar: B3's chip fold (`apply-quick-reply-event.ts`) keys its own replace-per-
 *  source the same way, and both must agree with the server's `slotKey` — so the string is minted here once,
 *  not re-spelled per consumer where a prefix could drift. */
export function sourceKey(source: AutomationEmitSource): string {
  return source.kind === "rule" ? `rule|${source.ruleId}` : `plugin|${source.pluginId}`;
}

/** The exhaustive per-member fold. A mapped type over the union's discriminant (the `RPG_BUS_FILTERS` shape
 *  in `data/invalidation.ts`): a new `AutomationBusEvent` member fails `tsc` here until it is given an arm,
 *  and each arm receives its OWN narrowed event with no cast. */
type AutomationEventArms = {
  [K in AutomationBusEvent["type"]]: (asks: readonly PendingAsk[], event: Extract<AutomationBusEvent, { type: K }>) => readonly PendingAsk[];
};

const AUTOMATION_EVENT_ARMS: AutomationEventArms = {
  suggestionRaised: (asks, event) => [
    ...asks.filter((ask) => sourceKey(ask.source) !== sourceKey(event.source)),
    {
      id: event.suggestionId,
      source: event.source,
      chatId: event.chatId,
      kind: event.kind,
      summary: event.summary,
      expiresAt: event.expiresAt,
      ...(event.detail === undefined ? {} : { detail: event.detail }),
    },
  ],
  // The RETIREMENT twin of `suggestionRaised` (S4): the host answered THIS ask (confirm or dismiss) on some
  // tab, the server deleted it from the in-RAM store and emitted this, so drop the matching card on THIS tab
  // too. Id-keyed, not source-keyed: unlike a raise (one live card per origin) a resolve names the exact ask
  // that left the store, so a rule's newer live ask survives its older one being answered.
  suggestionResolved: (asks, event) => asks.filter((ask) => ask.id !== event.suggestionId),
  // A rule that auto-disabled had its asks VOIDED server-side; drop the same ones here. Plugin-origin asks are
  // untouched by a rule's death — their own void rides the plugin's deactivate/uninstall.
  ruleAutoDisabled: (asks, event) => asks.filter((ask) => !(ask.source.kind === "rule" && ask.source.ruleId === event.ruleId)),
  quickReplySurfaced: (asks) => asks,
  ruleFired: (asks) => asks,
  ruleErrored: (asks) => asks,
  rulesChanged: (asks) => asks,
};

/** Fold ONE live automation event into the ask list. */
export function applyAutomationBusEvent(asks: readonly PendingAsk[], event: AutomationBusEvent): readonly PendingAsk[] {
  const arm = AUTOMATION_EVENT_ARMS[event.type] as (a: readonly PendingAsk[], e: AutomationBusEvent) => readonly PendingAsk[];
  return arm(asks, event);
}

/** Drop asks the server has already swept. The client holds the same TTL the server stamped (`expiresAt`
 *  rides the event), so both sides expire an ask on the same edge and a card can never sit offering an
 *  answer the confirm would refuse as gone. */
export function pruneExpiredAsks(asks: readonly PendingAsk[], nowMs: number): readonly PendingAsk[] {
  return asks.filter((ask) => ask.expiresAt > nowMs);
}
