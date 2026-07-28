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
      castFields: game.config.features.castFields,
      relationshipHints: game.config.features.relationshipHints,
    };
  }
  return { getConfigView };
}
