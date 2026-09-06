// The typed API surface: the DI bundle, the producer-facing `emit` op type, and the 4-verb interface.
// notifications is the per-user durable inbox: the table is the source of truth — durable-first, `record`
// INSERTs the row and the per-user bus fan-out is a separate after-commit concern.

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { ResolveStandingAsks } from "./ops.ts";
import type { DismissParams, ListInboxParams, MarkAllReadParams, RecordParams, RefreshStandingParams, ReplaySinceParams, RetractParams } from "./params.ts";
import type { ListInboxResult, MarkAllReadResult } from "./results.ts";
import type { InboxView } from "./views.ts";

/** The DI bundle every verb closes over, wired at the composition root. */
export interface NotificationsContext {
  db: Db;
  now: () => number;
  /** The ONE cross-feature read this domain consumes (#1799) — which of a page's chat-owned decisions are
   *  still standing, so `list`/`replaySince` can stamp `InboxView.actionable`. Declared in `./ops.ts` (the
   *  consumer's own contract) and supplied by `entry/compose` from the chat domain; NOT optional, because a
   *  missing resolver would silently answer "nothing is standing" and the bell's dot would go quiet on
   *  exactly the rows it exists for. */
  resolveStandingAsks: ResolveStandingAsks;
}

/** The producer-facing op a producer injects to deliver a notification — the one cross-feature edge. `emit`
 *  = `record` (the durable INSERT) + the after-commit per-user bus fan-out, durable-first (the INSERT
 *  happens before any fan-out, so the event is deliverable from the table alone). Composed at `entry/` from
 *  this domain's `record` + transport's bus. */
export type EmitNotification = (event: NotificationEvent) => Promise<void>;

/** The verbs. `record`/`retract` are the producer writes (recipient-addressed); markAllRead/dismiss/list
 *  are caller-scoped to `principal.userId` — a user touches only their own inbox. */
export interface NotificationsService {
  /** Durable-first write: INSERT one closed event for its recipient with a db-driven monotonic `seq`,
   *  parsed through the union schema. Returns the stored `InboxView`. */
  record: (params: RecordParams) => Promise<InboxView>;
  /** Correct a STANDING ASK's payload in place (#1041) — same recipient, same type, `seq`/`readAt`
   *  untouched, so a number that only got smaller never re-badges the bell. Returns the rows it changed;
   *  EMPTY when the reader has no active row of that type (they dismissed it — not a reason to insert).
   *  The GROWING case is `record` with `supersedeActiveOfSameType`, which DOES re-badge. */
  refreshStanding: (params: RefreshStandingParams) => Promise<readonly InboxView[]>;
  /** Withdraw a STANDING ASK the producer no longer has (#1041): dismiss every active row of `type` for
   *  `recipientUserId`, idempotently, and return the rows actually flipped so the caller can publish them.
   *  Recipient-addressed like `record` — `dismiss` is the reader's caller-scoped act, this is the
   *  producer's. */
  retract: (params: RetractParams) => Promise<readonly InboxView[]>;
  /** Mark every one of the caller's currently-unread notifications read, in one db UPDATE. Returns the
   *  count of rows actually flipped. */
  markAllRead: (params: MarkAllReadParams) => Promise<MarkAllReadResult>;
  /** Dismiss one of the caller's notifications (idempotent). Removes it from the active `list`. */
  dismiss: (params: DismissParams) => Promise<InboxView>;
  /** The caller's own active inbox (dismissed excluded), newest-first, cursor-paged on `seq`. */
  list: (params: ListInboxParams) => Promise<ListInboxResult>;
  /** The RESUME read behind the socket's `notifications` room (#1459): the caller's own active rows with
   *  `seq > afterSeq`, ASCENDING, at most `limit` (clamped to the shared `NOTIFICATIONS_LIST_MAX_LIMIT`
   *  ceiling, exactly as `list` is). A short page means the log is exhausted.
   *
   *  IT IS A SEPARATE READ FROM `list` BECAUSE THE DIRECTION IS THE CONTRACT. `list` serves a UI that pages
   *  DOWN from the newest row; a resume pages UP from what the reader last delivered, so any prefix of the
   *  answer is a complete answer for that prefix. Resuming through `list` cannot be made safe by a bigger
   *  bound — it can only make the silently-skipped middle rarer. */
  replaySince: (params: ReplaySinceParams) => Promise<readonly InboxView[]>;
}
