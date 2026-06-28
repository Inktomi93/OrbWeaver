// domain/notifications/contract/results — the list-page result shape (notifications.md §8-slot:
// "results.ts — the list page shape"). The per-row read-model is `InboxView` (contract/views.ts); this is
// the cursor page wrapping it. The cursor IS the monotonic `seq` (the one stable per-recipient ordering /
// resume key) — newest-first, so `nextCursor` is the seq to pass back for the page below it, or `null` when
// the inbox is exhausted (no further rows). record/markRead/dismiss return a bare `InboxView` directly off
// the service interface (one durable row each), so they need no wrapper type here.

import type { InboxView } from "./views";

/** A cursor page of the caller's own inbox — newest-first, `dismissedAt`-excluded (active inbox only). */
export interface ListInboxResult {
  readonly items: readonly InboxView[];
  /** The `seq` to pass as the next `cursor`, or `null` when no older active notification remains. */
  readonly nextCursor: number | null;
}
