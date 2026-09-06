// verb: list — the CALLER's OWN active inbox. Recipient-scoped to
// `principal.userId` (the scope is in the persistence WHERE clause — there is no cross-user read), dismissed
// excluded, newest-first, cursor-paged on the monotonic `seq`. `nextCursor` is the last row's `seq` when a
// full page came back (more may remain below it), else `null` (inbox exhausted).

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { ListInboxParams } from "../contract/params.ts";
import type { ListInboxResult } from "../contract/results.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import { selectInbox } from "../persistence/queries.ts";
import { asksNothing, NO_STANDING_ASKS, standingAsksOf, withActionable } from "../substrate/actionable.ts";

// The ceiling is the shared `NOTIFICATIONS_LIST_MAX_LIMIT` (`@orb/contracts/notifications` — the transport
// `.max()` references the same value); the `Math.min` is the backstop for the stream replay's internal calls.
const DEFAULT_LIMIT = 50;

export function createList(ctx: NotificationsContext): Pick<NotificationsService, "list"> {
  async function list(params: ListInboxParams): Promise<ListInboxResult> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, NOTIFICATIONS_LIST_MAX_LIMIT);
    const rows = await selectInbox(ctx.db, params.principal.userId, params.cursor, limit);
    // A full page means there may be older rows; the cursor is the oldest seq we returned.
    const nextCursor = rows.length === limit ? (rows.at(-1)?.seq ?? null) : null;
    // `actionable` (#1799) — ONE cross-feature call per PAGE, skipped entirely when this page names no
    // chat-owned decision, and stamped through the same substrate `replaySince` uses so the two wires
    // carrying `InboxView` can never disagree about the bell's dot.
    const asks = standingAsksOf(rows, params.principal.userId);
    const standing = asksNothing(asks) ? NO_STANDING_ASKS : await ctx.resolveStandingAsks(asks);
    return { items: withActionable(rows, standing), nextCursor };
  }
  return { list };
}
