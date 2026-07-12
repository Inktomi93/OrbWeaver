// verbs: markRead · markAllRead · dismiss — the CALLER's inbox-state flips.
// All are RECIPIENT-SCOPED to `principal.userId` (the scope lives in the persistence WHERE clause): a
// notification that isn't the caller's matches NOTHING → `DomainNotFoundError` for the single-row flips, so
// a user can neither read nor probe another's inbox; `markAllRead` never touches another recipient's rows
// either (same WHERE-clause scope, just no id filter). All are IDEMPOTENT — the timestamp is set once
// (`COALESCE` in persistence), so a re-flip returns the same row with the original instant. The flip
// instant is the injected clock.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DismissParams, MarkAllReadParams, MarkReadParams } from "../contract/params";
import type { MarkAllReadResult } from "../contract/results";
import type { NotificationsContext, NotificationsService } from "../contract/service";
import type { InboxView } from "../contract/views";
import { dismissScoped, markAllReadScoped, markReadScoped } from "../persistence/queries";

const ENTITY = "notification";

export function createRead(
  ctx: NotificationsContext,
): Pick<NotificationsService, "markRead" | "markAllRead" | "dismiss"> {
  async function markRead(params: MarkReadParams): Promise<InboxView> {
    const row = await markReadScoped(
      ctx.db,
      params.principal.userId,
      params.notificationId,
      ctx.now(),
    );
    if (row === undefined) {
      throw new DomainNotFoundError(ENTITY, params.notificationId);
    }
    return row;
  }

  async function markAllRead(params: MarkAllReadParams): Promise<MarkAllReadResult> {
    const markedCount = await markAllReadScoped(ctx.db, params.principal.userId, ctx.now());
    return { markedCount };
  }

  async function dismiss(params: DismissParams): Promise<InboxView> {
    const row = await dismissScoped(
      ctx.db,
      params.principal.userId,
      params.notificationId,
      ctx.now(),
    );
    if (row === undefined) {
      throw new DomainNotFoundError(ENTITY, params.notificationId);
    }
    return row;
  }

  return { markRead, markAllRead, dismiss };
}
