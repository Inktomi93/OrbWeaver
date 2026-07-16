// verbs: markRead · markAllRead · dismiss — the caller's inbox-state flips. All are recipient-scoped to
// principal.userId (WHERE-clause scope): a notification that isn't the caller's matches nothing ->
// DomainNotFoundError, so a user can neither read nor probe another's inbox. All are idempotent — the
// timestamp is set once (COALESCE in persistence).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DismissParams, MarkAllReadParams, MarkReadParams } from "../contract/params";
import type { MarkAllReadResult } from "../contract/results";
import type { NotificationsContext, NotificationsService } from "../contract/service";
import type { InboxView } from "../contract/views";
import { dismissScoped, markAllReadScoped, markReadScoped } from "../persistence/queries";

const ENTITY = "notification";

export function createRead(ctx: NotificationsContext): Pick<NotificationsService, "markRead" | "markAllRead" | "dismiss"> {
  async function markRead(params: MarkReadParams): Promise<InboxView> {
    const row = await markReadScoped(ctx.db, params.principal.userId, params.notificationId, ctx.now());
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
    const row = await dismissScoped(ctx.db, params.principal.userId, params.notificationId, ctx.now());
    if (row === undefined) {
      throw new DomainNotFoundError(ENTITY, params.notificationId);
    }
    return row;
  }

  return { markRead, markAllRead, dismiss };
}
