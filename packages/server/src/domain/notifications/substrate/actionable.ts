// domain/notifications/substrate/actionable — the PURE half of `InboxView.actionable` (#1799): which
// notification TYPES carry a decision at all, what each such row is waiting on, and how a resolved
// still-standing set becomes the stamped view. Zero I/O — the one external read is the injected
// `ResolveStandingAsks` op (contract/ops.ts), which the two read verbs call around these functions.
//
// IT IS ONE HOME BECAUSE THERE ARE TWO WIRES. `notifications.list` and the socket's `notifications` room
// frame both carry `InboxView`, and a reader that computed the indicator differently on a live arrival than
// on a page load would flicker the bell for reasons no one could reproduce. Both verbs stamp through
// `withActionable`, so the wires cannot disagree by construction.
//
// THE AXIS IS A MAPPED RECORD, NOT AN IF-CHAIN (Spine-TypeScript-and-Patterns §string-union dispatch): a
// new `NotificationType` member fails `tsc` HERE until someone says whether it is a decision or a notice.
// That is the whole point — the failure mode this replaces is a new actionable member shipping as
// informational and silently never raising the dot.

import type { InboxView, NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { ChatId, ChatInviteId } from "@orb/kit/ids";
import type { StandingAsksParams, StandingAsksResult } from "../contract/ops.ts";

/** The stored-row projection the persistence layer returns, minus the field this module adds. */
type UnstampedRow = Omit<InboxView, "actionable">;

/**
 * Does a row of this type ask its reader to DECIDE something? Exhaustive by construction.
 *
 * `true` means the row offers an act (accept / decline / confirm / review) and the bell's dot must survive
 * being read until that act happens. `false` is the informational half — a kick, a completed handoff, a
 * dropped deferred turn, an auto-disable notice: they are news, and reading them IS the whole interaction.
 *
 * `plugins-awaiting-consent` is `true` and needs NO external check, which is a property of its producer
 * rather than an exception here: it is a SINGLETON standing ask that `domain/plugin/substrate/consent-prompt.ts`
 * re-derives from the table on every consent-shaped act and RETRACTS (dismisses) the moment the count
 * reaches zero. A dismissed row is already excluded from both reads, so an ACTIVE consent row is a live ask
 * by construction. (`.min(1)` on its payload is the same rule at the type.)
 */
const CARRIES_DECISION: Readonly<Record<NotificationType, boolean>> = {
  invite: true,
  "handoff-nominated": true,
  "plugins-awaiting-consent": true,
  kicked: false,
  "handoff-accepted": false,
  "deferred-turn-dropped": false,
  "automation-notice": false,
  "plugin-disabled": false,
};

/** The ids on this page that need the chat domain's answer, deduped. Rows whose decision is self-evident
 *  from their own presence (the consent singleton) name nothing here — they are settled in `withActionable`
 *  without a round trip, so a page of pure consent/informational rows makes no cross-domain call at all. */
export function standingAsksOf(rows: readonly UnstampedRow[], recipientUserId: StandingAsksParams["recipientUserId"]): StandingAsksParams {
  const inviteIds = new Set<ChatInviteId>();
  const nominatedChatIds = new Set<ChatId>();
  for (const row of rows) {
    const payload: NotificationEvent = row.payload;
    if (payload.type === "invite") {
      inviteIds.add(payload.inviteId);
    } else if (payload.type === "handoff-nominated") {
      nominatedChatIds.add(payload.chatId);
    }
  }
  return { recipientUserId, inviteIds: [...inviteIds], nominatedChatIds: [...nominatedChatIds] };
}

/** True when the page asks the chat domain nothing — the verbs skip the op entirely rather than paying a
 *  round trip to be told an empty set is empty. */
export function asksNothing(params: StandingAsksParams): boolean {
  return params.inviteIds.length === 0 && params.nominatedChatIds.length === 0;
}

/** The empty answer, for the skip path above. */
export const NO_STANDING_ASKS: StandingAsksResult = { inviteIds: [], nominatedChatIds: [] };

/**
 * Stamp `actionable` onto one page. A decision-carrying row is actionable when the chat domain still holds
 * its decision open; the consent singleton is actionable on its own presence; everything else is false.
 *
 * A row whose type carries a decision and whose id came back UNSETTLED is deliberately the false arm rather
 * than a defensive true: the provider re-checks the recipient, so "not in the standing set" covers settled,
 * revoked, deleted and never-yours alike, and every one of those is a decision this reader no longer has.
 */
export function withActionable(rows: readonly UnstampedRow[], standing: StandingAsksResult): InboxView[] {
  const invites = new Set<ChatInviteId>(standing.inviteIds);
  const nominations = new Set<ChatId>(standing.nominatedChatIds);
  return rows.map((row) => ({ ...row, actionable: isActionable(row.payload, invites, nominations) }));
}

/**
 * The WRITE-time stamp, for a row the producer just raised (`record`) or corrected in place
 * (`refreshStanding`). No cross-feature call and none is owed: the producer writes the row BECAUSE the
 * decision exists, so a decision-carrying member is standing at the instant it is recorded. This is what
 * the bus publishes, so a live arrival raises the dot without waiting for the reader's next list.
 */
export function asRaised(row: UnstampedRow): InboxView {
  return { ...row, actionable: CARRIES_DECISION[row.type] };
}

/**
 * The stamp for a row that has just LEFT the inbox — `dismiss` (the reader's act) and `retract` (the
 * producer withdrawing a standing ask). A dismissed row asks nothing of anyone by definition, and both
 * reads exclude it, so this is the honest terminal value rather than a convenience.
 */
export function asSettled(row: UnstampedRow): InboxView {
  return { ...row, actionable: false };
}

function isActionable(payload: NotificationEvent, invites: ReadonlySet<ChatInviteId>, nominations: ReadonlySet<ChatId>): boolean {
  if (!CARRIES_DECISION[payload.type]) {
    return false;
  }
  if (payload.type === "invite") {
    return invites.has(payload.inviteId);
  }
  if (payload.type === "handoff-nominated") {
    return nominations.has(payload.chatId);
  }
  // The consent singleton — the only decision-carrying member whose presence IS its liveness.
  return true;
}
