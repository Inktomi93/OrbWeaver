// domain/notifications/contract/service — the typed API surface (read THIS to know everything the domain
// does). Holds the explicit DI bundle, the producer-facing `emit` op type, and the 4-verb interface.
//
// notifications is the per-user DURABLE inbox (D16): the per-chat bus cannot reach a
// NON-member, so invite / kick / host-handoff delivery rides a per-user channel that survives the recipient
// being offline. The TABLE is the source of truth — DURABLE-FIRST: `record` INSERTs the row; the per-user
// bus fan-out is a separate after-commit concern composed at the entry root (see `EmitNotification`).

import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type {
  DismissParams,
  ListInboxParams,
  MarkAllReadParams,
  MarkReadParams,
  RecordParams,
} from "./params";
import type { ListInboxResult, MarkAllReadResult } from "./results";
import type { InboxView } from "./views";

/**
 * The DI bundle every verb closes over, wired at the composition root (`service.ts`). Explicit interface
 * (not `ReturnType<typeof createNotificationsContext>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). Production passes the real clock at `entry/`; tests pass the
 *     frozen clock. No ambient `Date.now()` in a verb (determinism); the monotonic `seq` is db-driven
 *     (a `MAX(seq)+1` subquery inside the INSERT), never minted in JS.
 */
export interface NotificationsContext {
  db: Db;
  now: () => number;
  /** Is `userId` an agent principal (`users.kind='agent'`)? The D60 recipient belt
   *  (agent-principal-design/06 §3 + inv 2): an agent is structurally sessionless — no session, no
   *  subscription, nothing that reads its inbox — so `record` REFUSES an agent recipient (a durable row that
   *  could only rot). notifications never reads `users` itself (`no-direct-users-read`); the entry root — the
   *  sanctioned reader — supplies this as an inline `users.kind` read (the chat `resolveAgentEnabled`
   *  precedent). A missing row ⇒ `false` (only a real agent row refuses). REQUIRED, not optional: a forgotten
   *  wiring must fail `tsc`, never silently drop the belt. */
  isAgentRecipient: (userId: UserId) => Promise<boolean>;
}

/**
 * The producer-facing op a producer (chat's invite/kick/handoff, + any future producer) injects to deliver
 * a notification. It is the one cross-feature edge: a
 * producer NEVER imports this domain's internals — it receives `emit` at the composition root. `emit` =
 * `record` (the durable INSERT — its core) + the after-commit per-user bus fan-out; **durable-first**, the
 * INSERT happens before any fan-out so the event is deliverable from the table alone (`list` returns it even
 * if the bus path is dead). The recipient is the event's mandatory
 * `recipientUserId`; credentials/secrets are type-level unrepresentable in the union it carries (the
 * secret-free belt). The op is COMPOSED at `entry/` from this domain's `record` + transport's bus — it is not minted here.
 *
 * This domain owns ONLY the durable `record` half. The after-commit per-user bus FAN-OUT and the resumable
 * `authedProcedure.subscription` (`tracked()` + `lastEventId` replay over this table) are TRANSPORT's
 * (this domain owns neither); `emit` IS stitched together at the entry root (PD-23 cleared —
 * `entry/compose/chat.ts`: `record` → `publishNotification`, durable-first). notifications never imports
 * transport — the edge is one-directional.
 */
export type EmitNotification = (event: NotificationEvent) => Promise<void>;

/**
 * The 4 verbs. `record` is the producer write (durable INSERT,
 * scoped to the event's recipient); markRead / dismiss / list are caller-scoped to `principal.userId` — a
 * user reads/touches ONLY their own inbox (no cross-user inbox read).
 */
export interface NotificationsService {
  /** Durable-first write: INSERT one closed event for its recipient with a db-driven monotonic `seq`,
   *  parsing it through the union schema (the secret-free belt strips any unknown key at the write seam).
   *  Returns the stored `InboxView`. The injected `emit` op wraps this + the after-commit fan-out. */
  record: (params: RecordParams) => Promise<InboxView>;
  /** Mark one of the CALLER's notifications read (idempotent — `readAt` is set once, re-reads don't move
   *  it). Scoped to `principal.userId`; a notification not in the caller's inbox throws `DomainNotFoundError`
   *  (a user cannot probe another's inbox). Returns the updated `InboxView`. */
  markRead: (params: MarkReadParams) => Promise<InboxView>;
  /** Mark EVERY one of the CALLER's currently-unread notifications read, in ONE db UPDATE (the notification
   *  bell's "open = read everything" gesture — no per-row loop, no N mutations). Scoped to
   *  `principal.userId`; idempotent (an already-read row is untouched, so re-opening costs nothing).
   *  Returns the count of rows actually flipped. */
  markAllRead: (params: MarkAllReadParams) => Promise<MarkAllReadResult>;
  /** Dismiss one of the CALLER's notifications (idempotent — `dismissedAt` set once). Removes it from the
   *  active `list`; same recipient-scope + not-found semantics as `markRead`. Returns the updated view. */
  dismiss: (params: DismissParams) => Promise<InboxView>;
  /** The caller's OWN active inbox (dismissed excluded), newest-first, cursor-paged on `seq`. */
  list: (params: ListInboxParams) => Promise<ListInboxResult>;
}
