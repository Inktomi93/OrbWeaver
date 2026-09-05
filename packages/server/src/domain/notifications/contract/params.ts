// domain/notifications/contract/params — every verb's *Params, declared once. `record` is a producer op
// carrying the closed NotificationEvent (recipient comes from event.recipientUserId, not a Principal);
// markAllRead/dismiss/list are caller-scoped off the resolved Principal — a user only ever touches its own inbox.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";

interface NotificationActorParams {
  readonly principal: Principal;
}

/** coStatements is the PD-24 tx seam: producer statements committed in one db.batch WITH the notification
 *  insert (record owns the commit; the producer must not pre-execute them). Absent → plain insert. */
export interface RecordParams {
  readonly event: NotificationEvent;
  readonly coStatements?: readonly unknown[] | undefined;
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
