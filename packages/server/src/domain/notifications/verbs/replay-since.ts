// verb: replaySince — the durable RESUME read the socket's `notifications` room pumps (#1459). Recipient-
// scoped to `principal.userId` (the scope is in the persistence WHERE clause — there is no cross-user read),
// dismissed excluded, `seq` strictly above the caller's watermark, OLDEST-first, clamped to the same shared
// `NOTIFICATIONS_LIST_MAX_LIMIT` ceiling `list` uses.
//
// WHY THE INBOX OWNS ITS OWN RESUME READ instead of the transport paging `list`: a resume is a walk UP from
// what the reader last delivered, and `list` walks DOWN from the newest row. A bounded downward walk that
// does not reach the watermark holds the TOP of the log and has skipped its MIDDLE — and the reader, having
// delivered the top, advances past the middle forever. Upward, every partial answer is a contiguous prefix,
// so a caller that stops early (a shed, an abort, a slow consumer) resumes exactly where it stopped. The
// direction is the contract, which is why it is a distinct verb rather than a flag on `list`.

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { ReplaySinceParams } from "../contract/params.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import type { InboxView } from "../contract/views.ts";
import { selectInboxSince } from "../persistence/queries.ts";
import { asksNothing, NO_STANDING_ASKS, standingAsksOf, withActionable } from "../substrate/actionable.ts";

// The resume's own default page. The ceiling below it is the shared one, so a caller asking for more than
// `NOTIFICATIONS_LIST_MAX_LIMIT` gets a clamped page — which a caller detecting "the log is exhausted" by a
// SHORT page would read as exhaustion. Callers page at the ceiling for that reason.
const DEFAULT_LIMIT = NOTIFICATIONS_LIST_MAX_LIMIT;

export function createReplaySince(ctx: NotificationsContext): Pick<NotificationsService, "replaySince"> {
  async function replaySince(params: ReplaySinceParams): Promise<readonly InboxView[]> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, NOTIFICATIONS_LIST_MAX_LIMIT);
    const rows = await selectInboxSince(ctx.db, params.principal.userId, params.afterSeq, limit);
    // The SAME `actionable` stamp `list` applies (#1799) — a live arrival and a page load must agree about
    // the dot, so both wires run one substrate.
    const asks = standingAsksOf(rows, params.principal.userId);
    const standing = asksNothing(asks) ? NO_STANDING_ASKS : await ctx.resolveStandingAsks(asks);
    return withActionable(rows, standing);
  }
  return { replaySince };
}
