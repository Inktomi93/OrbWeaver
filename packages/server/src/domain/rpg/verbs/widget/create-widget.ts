// domain/rpg/verbs/widget/create-widget — createWidget (rpg-design/05 §4.4). A HUD widget DEFINITION (identity
// plane — the value plane lives on the snapshot's `widgetValues`). Host-gated.

import type { RpgWidgetId } from "@orb/kit/ids";
import type { CreateWidgetParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { insertWidget } from "../../persistence/widgets";

export function createCreateWidget(ctx: RpgContext): Pick<RpgService, "createWidget"> {
  async function createWidget(params: CreateWidgetParams): Promise<RpgWidgetId> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    const id = ctx.ids.widget();
    await insertWidget(ctx.db, { id, gameId: game.id, def: params.def, now: ctx.now() });
    return id;
  }
  return { createWidget };
}
