// domain/notifications/contract/results — the list-page result shape.
// The per-row read-model is `InboxView` (contract/views.ts); this is the cursor page wrapping it.
// record/markRead/dismiss return a bare `InboxView` directly off the service interface (one durable
// row each), so they need no wrapper type here.

import type { InboxView } from "./views";

/** A cursor page of the caller's own inbox — newest-first, `dismissedAt`-excluded (active inbox only). */
export interface ListInboxResult {
  readonly items: readonly InboxView[];
  /** The `seq` to pass as the next `cursor`, or `null` when no older active notification remains. */
  readonly nextCursor: number | null;
}

/** The bulk `markAllRead` result — just the count actually flipped (rows already read don't recount). */
export interface MarkAllReadResult {
  readonly markedCount: number;
}
