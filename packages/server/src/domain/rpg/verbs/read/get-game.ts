// domain/rpg/verbs/read/get-game — getGame (rpg-design/05 §4.8). The takeover's mode read + the honest-arms
// `trackersReadOnly` verdict. Member-gated.

import type { RpgGameView } from "@orb/contracts/rpg";
import type { ReadGameParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveMember } from "../../guard";

export function createGetGame(ctx: RpgContext): Pick<RpgService, "getGame"> {
  async function getGame(params: ReadGameParams): Promise<RpgGameView> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const trackersReadOnly = await ctx.resolveTrackersReadOnly(params.chatId);
    return {
      id: game.id,
      chatId: game.chatId,
      mode: game.mode,
      status: game.status,
      trackersReadOnly,
      extractionMode: game.config.extractionMode,
      publicConfig: { statProfile: game.config.statProfile },
    };
  }
  return { getGame };
}
