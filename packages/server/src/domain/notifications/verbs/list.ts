// verb: list — the CALLER's OWN active inbox. Recipient-scoped to
// `principal.userId` (the scope is in the persistence WHERE clause — there is no cross-user read), dismissed
// excluded, newest-first, cursor-paged on the monotonic `seq`. `nextCursor` is the last row's `seq` when a
// full page came back (more may remain below it), else `null` (inbox exhausted).

import type { ListInboxParams } from "../contract/params.ts";
import type { ListInboxResult } from "../contract/results.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import { selectInbox } from "../persistence/queries.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function createList(ctx: NotificationsContext): Pick<NotificationsService, "list"> {
  async function list(params: ListInboxParams): Promise<ListInboxResult> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const rows = await selectInbox(ctx.db, params.principal.userId, params.cursor, limit);
    // A full page means there may be older rows; the cursor is the oldest seq we returned.
    const nextCursor = rows.length === limit ? (rows.at(-1)?.seq ?? null) : null;
    return { items: rows, nextCursor };
  }
  return { list };
}
