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
      publicConfig: {
        statProfile: game.config.statProfile,
        dateMode: game.config.dateMode, // #9 — the ambient-date display mode (member-safe)
        immersiveHtml: game.config.features.immersiveHtml,
        // P5 (§5.4/§6.4) — the wand's game affordance gates + the choice-click behavior (member-safe).
        cyoa: game.config.features.cyoa,
        cyoaChoiceBehavior: game.config.features.cyoaChoiceBehavior,
        plotProgression: game.config.features.plotProgression,
      },
    };
  }
  return { getGame };
}
