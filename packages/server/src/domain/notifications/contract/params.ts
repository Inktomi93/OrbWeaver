// domain/notifications/contract/params — every verb's *Params, declared ONCE (§7.4). Two shapes of caller:
//   • `record` is a PRODUCER op — it carries the closed `NotificationEvent`; the recipient is read from the
//     event's MANDATORY `recipientUserId` (no Principal — the producer, e.g. chat's invite/kick/handoff,
//     names the recipient, who is by definition NOT the producer). Wrapped by the injected `emit` op.
//   • markRead / dismiss / list are CALLER-scoped — they carry the resolved `Principal`; the verb scopes
//     every read/write to `principal.userId`, so a user can only ever touch their OWN inbox
//     (notifications.md invariant #3 — no cross-user inbox read). ids/role are branded; the cursor is the seq.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";

/** Common to every caller-scoped verb: the acting principal the inbox scope is derived from. */
export interface NotificationActorParams {
  readonly principal: Principal;
}

/** The producer write — the closed event names its own recipient (`event.recipientUserId`, mandatory).
 *  `coStatements` is the PD-24 tx seam: the producer's membership-transition statements (`BatchStmt`s,
 *  erased generic like `ApplyStatsDelta`'s Batch — the producer side keeps no `@orb/db` builder coupling),
 *  committed in ONE `db.batch` WITH the notification INSERT — the record op OWNS the commit; the producer
 *  must NOT pre-execute them. Absent ⇒ the plain durable INSERT. */
export interface RecordParams {
  readonly event: NotificationEvent;
  readonly coStatements?: readonly unknown[] | undefined;
}

export interface MarkReadParams extends NotificationActorParams {
  readonly notificationId: NotificationId;
}

export interface DismissParams extends NotificationActorParams {
  readonly notificationId: NotificationId;
}

export interface ListInboxParams extends NotificationActorParams {
  /** Newest-first cursor — fetch the page of active notifications with `seq` strictly below this; omit for
   *  the first (newest) page. */
  readonly cursor?: number;
  /** Page size; the verb clamps to a sane max. */
  readonly limit?: number;
}
