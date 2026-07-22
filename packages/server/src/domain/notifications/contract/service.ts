// The typed API surface: the DI bundle, the producer-facing `emit` op type, and the 4-verb interface.
// notifications is the per-user durable inbox: the table is the source of truth — durable-first, `record`
// INSERTs the row and the per-user bus fan-out is a separate after-commit concern.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { DismissParams, ListInboxParams, MarkAllReadParams, RecordParams } from "./params";
import type { ListInboxResult, MarkAllReadResult } from "./results";
import type { InboxView } from "./views";

/** The DI bundle every verb closes over, wired at the composition root. */
export interface NotificationsContext {
  db: Db;
  now: () => number;
  /** Is `userId` an agent principal? An agent is structurally sessionless — nothing reads its inbox — so
   *  `record` refuses an agent recipient. A missing row ⇒ `false`. */
  isAgentRecipient: (userId: UserId) => Promise<boolean>;
}

/** The producer-facing op a producer injects to deliver a notification — the one cross-feature edge. `emit`
 *  = `record` (the durable INSERT) + the after-commit per-user bus fan-out, durable-first (the INSERT
 *  happens before any fan-out, so the event is deliverable from the table alone). Composed at `entry/` from
 *  this domain's `record` + transport's bus. */
export type EmitNotification = (event: NotificationEvent) => Promise<void>;

/** The verbs. `record` is the producer write; markAllRead/dismiss/list are caller-scoped to
 *  `principal.userId` — a user touches only their own inbox. */
export interface NotificationsService {
  /** Durable-first write: INSERT one closed event for its recipient with a db-driven monotonic `seq`,
   *  parsed through the union schema. Returns the stored `InboxView`. */
  record: (params: RecordParams) => Promise<InboxView>;
  /** Mark every one of the caller's currently-unread notifications read, in one db UPDATE. Returns the
   *  count of rows actually flipped. */
  markAllRead: (params: MarkAllReadParams) => Promise<MarkAllReadResult>;
  /** Dismiss one of the caller's notifications (idempotent). Removes it from the active `list`. */
  dismiss: (params: DismissParams) => Promise<InboxView>;
  /** The caller's own active inbox (dismissed excluded), newest-first, cursor-paged on `seq`. */
  list: (params: ListInboxParams) => Promise<ListInboxResult>;
}
