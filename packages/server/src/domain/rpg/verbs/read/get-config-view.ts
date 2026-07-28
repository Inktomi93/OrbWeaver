// domain/rpg/verbs/read/get-config-view — getConfigView (rpg-design/05 §4.8). The Stats & Trackers editor
// surface: the full `statProfile` + `steeringNote` + the `gmPresetId`/`extractionMode` knobs. HOST-gated (never
// a member view — the host-read discipline).

import type { RpgConfigView } from "@orb/contracts/rpg";
import type { ReadGameParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";

export function createGetConfigView(ctx: RpgContext): Pick<RpgService, "getConfigView"> {
  async function getConfigView(params: ReadGameParams): Promise<RpgConfigView> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    return {
      statProfile: game.config.statProfile,
      steeringNote: game.config.lite.steeringNote,
      gmPresetId: game.gmPresetId,
      extractionMode: game.config.extractionMode,
      dateMode: game.config.dateMode, // #9 — the ambient-date mode knob
      castFields: game.config.features.castFields,
      relationshipHints: game.config.features.relationshipHints,
      deception: game.config.features.deception,
      omniscience: game.config.features.omniscience,
      hiddenContentReveal: game.config.features.hiddenContentReveal,
      recentBeatsKeepLast: game.config.features.recentBeatsKeepLast,
      pinnedOrbs: game.config.features.pinnedOrbs,
      immersiveHtml: game.config.features.immersiveHtml,
      immersiveHtmlInteractive: game.config.features.immersiveHtmlInteractive,
      cardKeepLastX: game.config.features.cardKeepLastX,
      // P5 play-style knobs (§5.4/§6.4).
      cyoa: game.config.features.cyoa,
      cyoaChoiceBehavior: game.config.features.cyoaChoiceBehavior,
      plotProgression: game.config.features.plotProgression,
    };
  }
  return { getConfigView };
}
