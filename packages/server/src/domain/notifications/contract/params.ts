// domain/notifications/contract/params — every verb's *Params, declared once. `record` is a producer op
// carrying the closed NotificationEvent (recipient comes from event.recipientUserId, not a Principal);
// markAllRead/dismiss/list are caller-scoped off the resolved Principal — a user only ever touches its own inbox.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";

interface NotificationActorParams {
  readonly principal: Principal;
}

/** coStatements is the tx seam: producer statements committed in one db.batch WITH the notification
 *  insert (record owns the commit; the producer must not pre-execute them). Absent → plain insert. */
export interface RecordParams {
  readonly event: NotificationEvent;
  readonly coStatements?: readonly unknown[] | undefined;
  /** SINGLETON DELIVERY (#1041): make this row the recipient's ONLY active row of its type — every active
   *  row of `event.type` is dismissed in the SAME batch as the insert. For a STANDING ASK whose text is a
   *  count ("N plugins are waiting"), a second row is not a second event, it is the same event said twice
   *  with an older number; stacking them is the inbox spam `AUTOMATION_NOTICE_COOLDOWN_SECONDS` exists to
   *  prevent, one aisle over. Absent → the plain append every episodic member wants (two invites ARE two
   *  events). Atomic by construction: supersede + insert ride one `db.batch`, so no window exists in which
   *  the recipient holds zero rows or two. */
  readonly supersedeActiveOfSameType?: boolean;
}

/** Correct a standing ask's own payload without re-announcing it — recipient-addressed like
 *  {@link RecordParams}; the recipient and the type both come from the event. */
export interface RefreshStandingParams {
  readonly event: NotificationEvent;
}

/** Withdraw a standing ask that no longer stands — recipient-addressed like {@link RecordParams} (a
 *  producer retracts FOR a user; it is not the caller). */
export interface RetractParams {
  readonly recipientUserId: NotificationEvent["recipientUserId"];
  readonly type: NotificationType;
}

export type MarkAllReadParams = NotificationActorParams;

export interface DismissParams extends NotificationActorParams {
  readonly notificationId: NotificationId;
}

export interface ListInboxParams extends NotificationActorParams {
  /** Newest-first cursor: fetch active notifications with seq strictly below this; omit for the first page. */
  readonly cursor?: number;
  readonly limit?: number;
}

/** The socket's durable RESUME read (#1459) — the caller's own active rows ABOVE a watermark, oldest-first.
 *  `afterSeq` is a WATERMARK, not a page cursor: it is what the reader has already delivered, so a caller that
 *  consumes a partial page and re-asks with the last seq it delivered loses nothing and repeats nothing. */
export interface ReplaySinceParams extends NotificationActorParams {
  readonly afterSeq: number;
  readonly limit?: number;
}
