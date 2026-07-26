// domain/rpg/verbs/widget/update-widget — updateWidget (rpg-design/05 §4.4). Host-gated. Scopes the write to
// THIS game (a foreign game's widget id matches zero rows → leak-free NOT-FOUND, never Forbidden — the
// cross-tenant IDOR belt).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { UpdateWidgetParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { updateWidget as updateWidgetRow } from "../../persistence/widgets";

export function createUpdateWidget(ctx: RpgContext): Pick<RpgService, "updateWidget"> {
  async function updateWidget(params: UpdateWidgetParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    if (!(await updateWidgetRow(ctx.db, game.id, params.widgetId, params.patch))) {
      throw new DomainNotFoundError("widget", params.widgetId);
    }
  }
  return { updateWidget };
}
