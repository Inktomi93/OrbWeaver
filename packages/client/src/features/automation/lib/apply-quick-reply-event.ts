// B3 — THE CLIENT FOLD for member-visible QUICK-REPLY CHIPS.
//
// The sibling to `apply-automation-bus-event.ts` (the S4 CARD fold), and deliberately its OWN file: that
// header states plainly why the chip arm there is a no-op — "chips are B3's row, published by its OWN control
// source into the same band. Folding them here would put two owners on one control kind." This is that fold,
// and this is that owner.
//
// It is a REDUCER over the SAME live-only automation room the card source subscribes to (no cursor, no
// replay — `transport/trpc/stream/sources/automation.ts`), so its job is to fold `quickReplySurfaced` events
// into the live chip sets the chip source renders. Every OTHER member is a no-op, and the exhaustive
// `Record<AutomationBusEvent["type"], …>` is what forces a future bus member to make a CHIP decision here too
// (the card fold forces the CARD decision independently — the two surfaces answer separately).
//
// WHY THE NON-SURFACING ARMS ARE NO-OPS, unlike the card fold's `ruleAutoDisabled` DROP. A card has a server
// RAM record (RULED F1) that the server VOIDS on auto-disable, so a surviving card's `confirm` could only
// refuse — the client must drop it to stay honest. A chip has NONE of that: no id, no expiry, no server
// record, no void event. `quickReplySurfaced` carries rendered display strings, and a chip click just posts
// that text as the clicking member's own turn (send) or seeds their composer (compose) — a legal act whatever
// the rule's later state. So there is nothing a `ruleAutoDisabled`/`ruleFired`/… could invalidate: a chip's
// ONLY lifecycle edges are REPLACE-PER-SOURCE (a fresh surfacing from the same origin) and the source's
// reconnect-clear (a live-only room trusts nothing across a gap).

import type { AutomationBusEvent, AutomationEmitSource } from "@orb/contracts/automation";
import { sourceKey } from "./apply-automation-bus-event.ts";

/** The `quickReplySurfaced` arm of the bus union — narrowed once so the chip shape derives from the wire and
 *  is never re-spelled (`no-inline-types`: the choice shape has ONE home, the contract's union). */
type QuickReplyEvent = Extract<AutomationBusEvent, { type: "quickReplySurfaced" }>;

/** One origin's live chip set — the rendered choices a rule OR plugin surfaced, kept whole. There is no fuller
 *  shape to fetch: the chips are transient display strings, never a row (the reason the event carries text and
 *  not an id). Keyed for replacement by {@link sourceKey}, exactly as the card fold keys its asks. */
export interface SurfacedChipSet {
  /** WHO surfaced these chips — a rule the host wrote, or an INSTALLED PLUGIN (both ride the same bus and the
   *  same three-posture law). The replace-per-source key, so a cadence rule that re-fires keeps ONE live set. */
  readonly source: AutomationEmitSource;
  readonly choices: QuickReplyEvent["choices"];
}

/** The exhaustive per-member fold (the card fold's shape). A mapped type over the union's discriminant: a new
 *  `AutomationBusEvent` member fails `tsc` here until it is given an arm, and each arm receives its OWN
 *  narrowed event with no cast. */
type QuickReplyEventArms = {
  [K in AutomationBusEvent["type"]]: (chips: readonly SurfacedChipSet[], event: Extract<AutomationBusEvent, { type: K }>) => readonly SurfacedChipSet[];
};

const QUICK_REPLY_EVENT_ARMS: QuickReplyEventArms = {
  // The ONE arm that moves a chip. Replace-per-source MIRRORS the card fold and the server's slot: one live
  // set per origin, so a rule that surfaces chips every beat keeps ONE row of chips, not a growing wall.
  quickReplySurfaced: (chips, event) => [
    ...chips.filter((set) => sourceKey(set.source) !== sourceKey(event.source)),
    { source: event.source, choices: event.choices },
  ],
  // Cards, not chips — the S4 fold's surface (see this file's header for why neither moves a chip). A raise
  // and its RETIREMENT twin both belong to the card fold; a chip has no id to match `suggestionResolved` on.
  suggestionRaised: (chips) => chips,
  suggestionResolved: (chips) => chips,
  // The B2 fire-log signals — no chip lifecycle rides them (a chip has no server record to void; see header).
  ruleAutoDisabled: (chips) => chips,
  ruleFired: (chips) => chips,
  ruleErrored: (chips) => chips,
  rulesChanged: (chips) => chips,
};

/** Fold ONE live automation event into the chip sets. */
export function applyQuickReplyEvent(chips: readonly SurfacedChipSet[], event: AutomationBusEvent): readonly SurfacedChipSet[] {
  const arm = QUICK_REPLY_EVENT_ARMS[event.type] as (c: readonly SurfacedChipSet[], e: AutomationBusEvent) => readonly SurfacedChipSet[];
  return arm(chips, event);
}
