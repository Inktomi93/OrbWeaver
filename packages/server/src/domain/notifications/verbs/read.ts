// verbs: markAllRead · dismiss — the caller's inbox-state flips. Both are recipient-scoped to
// principal.userId (WHERE-clause scope): a notification that isn't the caller's matches nothing ->
// DomainNotFoundError, so a user can't probe another's inbox. Both are idempotent — the timestamp is set
// once (COALESCE in persistence).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DismissParams, MarkAllReadParams } from "../contract/params.ts";
import type { MarkAllReadResult } from "../contract/results.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import type { InboxView } from "../contract/views.ts";
import { dismissScoped, markAllReadScoped } from "../persistence/queries.ts";

const ENTITY = "notification";

export function createRead(ctx: NotificationsContext): Pick<NotificationsService, "markAllRead" | "dismiss"> {
  async function markAllRead(params: MarkAllReadParams): Promise<MarkAllReadResult> {
    const markedCount = await markAllReadScoped(ctx.db, params.principal.userId, ctx.now());
    return { markedCount };
  }

  async function dismiss(params: DismissParams): Promise<InboxView> {
    const row = await dismissScoped(ctx.db, params.principal.userId, params.notificationId, ctx.now());
    if (row === undefined) {
      throw new DomainNotFoundError(ENTITY, params.notificationId);
    }
    return row;
  }

  return { markAllRead, dismiss };
}
