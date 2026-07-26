// domain/rpg/verbs/widget/delete-widget — deleteWidget (rpg-design/05 §4.4). Host-gated, game-scoped (the
// cross-tenant IDOR belt: a foreign game's widget id → leak-free NOT-FOUND).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DeleteWidgetParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { deleteWidget as deleteWidgetRow } from "../../persistence/widgets";

export function createDeleteWidget(ctx: RpgContext): Pick<RpgService, "deleteWidget"> {
  async function deleteWidget(params: DeleteWidgetParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    if (!(await deleteWidgetRow(ctx.db, game.id, params.widgetId))) {
      throw new DomainNotFoundError("widget", params.widgetId);
    }
  }
  return { deleteWidget };
}
