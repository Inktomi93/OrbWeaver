// domain/notifications/contract/results — the list-page result shape. record/dismiss return a
// bare InboxView directly off the service interface, so they need no wrapper type here.

import type { InboxView } from "./views";

/** Newest-first, dismissedAt-excluded (active inbox only). */
export interface ListInboxResult {
  readonly items: readonly InboxView[];
  readonly nextCursor: number | null;
}

export interface MarkAllReadResult {
  readonly markedCount: number;
}
