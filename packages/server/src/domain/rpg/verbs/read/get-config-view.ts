// domain/rpg/verbs/read/get-config-view — getConfigView (rpg-design/05 §4.8). The Stats & Trackers editor
// surface: the full `statProfile` + `steeringNote` + the `gmPresetId`/`extractionMode` knobs, plus the game's
// authored user macros and the NAMES the active preset declares (the editor's shadow gloss — a game macro
// shadows a preset macro of the same name at turn time). HOST-gated (never a member view — the host-read
// discipline).

import type { RpgConfigView } from "@orb/contracts/rpg";
import type { ReadGameParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";

export function createGetConfigView(ctx: RpgContext): Pick<RpgService, "getConfigView"> {
  async function getConfigView(params: ReadGameParams): Promise<RpgConfigView> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    // The preset half of the two definition homes (owner ruling #20) — NAMES only: the editor's shadow gloss
    // needs to know which names are taken, never the preset's bodies. Resolved through the injected chat op
    // (the picks pane's own resolution), so the console cannot disagree with what the turn actually registers.
    const presetMacros = await ctx.resolvePresetUserMacros(params.chatId);
    return {
      statProfile: game.config.statProfile,
      steeringNote: game.config.lite.steeringNote,
      gmPresetId: game.gmPresetId,
      extractionMode: game.config.extractionMode,
      // The §1.3 extraction-depth knobs (host editor).
      extractionContext: game.config.extractionContext,
      extractionWindowTokens: game.config.extractionWindowTokens,
      reconcileEveryBeats: game.config.reconcileEveryBeats,
      dateMode: game.config.dateMode, // #9 — the ambient-date mode knob
      trackers: game.config.trackers,
      relationshipHints: game.config.features.relationshipHints,
      journalTypeHints: game.config.features.journalTypeHints,
      userMacros: game.config.userMacros,
      presetMacroNames: presetMacros.map((def) => def.name),
      deception: game.config.features.deception,
      omniscience: game.config.features.omniscience,
      hiddenContentReveal: game.config.features.hiddenContentReveal,
      recentBeatsKeepLast: game.config.features.recentBeatsKeepLast,
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
