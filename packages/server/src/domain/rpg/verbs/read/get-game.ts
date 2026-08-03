// domain/rpg/verbs/read/get-game — getGame (rpg-design/05 §4.8). The takeover's mode read + the honest-arms
// delivery verdicts (`trackersReadOnly` = the model write path for this game's mode; `canPopulate` = the
// structured writer the host born-state round needs — one resolve, both answers). Member-gated.

import type { RpgGameView } from "@orb/contracts/rpg";
import type { ReadGameParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { deriveEffectiveDelivery } from "../../substrate/readonly-axis.ts";

export function createGetGame(ctx: RpgContext): Pick<RpgService, "getGame"> {
  async function getGame(params: ReadGameParams): Promise<RpgGameView> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const { trackersReadOnly, foldGuarded, canPopulate } = await ctx.resolveStateDelivery(params.chatId);
    return {
      id: game.id,
      chatId: game.chatId,
      mode: game.mode,
      status: game.status,
      trackersReadOnly,
      canPopulate,
      extractionMode: game.config.extractionMode,
      // EFF-3 — the knob is what the host ASKED for; this is what the room's connection actually does with it,
      // off the SAME one resolve above (D112 (4)'s freshness lie: a fold-guarded room read "Live" while it
      // rounded a beat behind). The derivation is rpg's law, homed beside the readonly axis it shares inputs with.
      effectiveDelivery: deriveEffectiveDelivery(game.config.extractionMode, { trackersReadOnly, foldGuarded }),
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
