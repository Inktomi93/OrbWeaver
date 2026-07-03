// verbs: markRead · dismiss — the CALLER's inbox-state flips.
// Both are RECIPIENT-SCOPED to `principal.userId` (the scope lives in the persistence WHERE clause): a
// notification that isn't the caller's matches NOTHING → `DomainNotFoundError`, so a user can neither read
// nor probe another's inbox. Both are IDEMPOTENT — the timestamp is set once (`COALESCE` in persistence),
// so a re-flip returns the same row with the original instant. The flip instant is the injected clock.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DismissParams, MarkReadParams } from "../contract/params";
import type { NotificationsContext, NotificationsService } from "../contract/service";
import type { InboxView } from "../contract/views";
import { dismissScoped, markReadScoped } from "../persistence/queries";

const ENTITY = "notification";

export function createRead(
  ctx: NotificationsContext,
): Pick<NotificationsService, "markRead" | "dismiss"> {
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

  return { markRead, dismiss };
}
