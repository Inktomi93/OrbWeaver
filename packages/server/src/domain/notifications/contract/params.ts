// domain/notifications/contract/params — every verb's *Params, declared once. `record` is a producer op
// carrying the closed NotificationEvent (recipient comes from event.recipientUserId, not a Principal);
// markRead/dismiss/list are caller-scoped off the resolved Principal — a user only ever touches its own inbox.

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

export interface MarkReadParams extends NotificationActorParams {
  readonly notificationId: NotificationId;
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
