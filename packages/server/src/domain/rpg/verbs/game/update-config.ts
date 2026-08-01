// domain/rpg/verbs/game/update-config — updateConfig (rpg-design/05 §4.4). The ONE config write door: the
// profile mutability matrix (§2.3), the `steeringNote`, and the `gmPresetId` + `extractionMode` KNOBS (§4.11 #1
// + the delivery-model amendment). Host-gated.

import type { RpgGameConfig, RpgGameFeatures, RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_EXTRACTION_MODES, rpgGameConfigSchema } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { RpgGameId } from "@orb/kit/ids";
import type { UpdateConfigParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { resolveHost } from "../../guard";
import { updateGame } from "../../persistence/games";
import { listSheets } from "../../persistence/sheets";

/** Assert a profile change is legal against the game's existing sheets (§2.3 mutability). Adds are always
 *  legal; a REMOVED attribute key must be referenced by NO sheet (attributes record) NOR the profile's own
 *  `skillGoverning` map — a referenced-remove is refused. */
async function assertProfileMutable(ctx: RpgContext, gameId: RpgGameId, next: RpgStatProfile): Promise<void> {
  const nextKeys = new Set(next.attributes.map((a) => a.key));
  // A skill governing a now-removed attribute is a self-reference dangling — refuse it.
  for (const [skill, attr] of Object.entries(next.skillGoverning)) {
    if (!nextKeys.has(attr)) {
      throw new DomainOperationError("rpg_profile_dangling_skill", `skill "${skill}" governs removed attribute "${attr}"`);
    }
  }
  const sheets = await listSheets(ctx.db, gameId);
  for (const sheet of sheets) {
    for (const key of Object.keys(sheet.sheet.attributes)) {
      if (!nextKeys.has(key)) {
        throw new DomainOperationError("rpg_profile_referenced_remove", `attribute "${key}" is still referenced by a sheet`);
      }
    }
  }
}

/** Merge the parity-plus feature knobs (§2.8/§2.1 M1 + P3 §3.3/§3.6 + the P4 card knobs) — omit keeps the
 *  EXISTING value (a passed array/record/scalar REPLACES; the host owns these authoritatively). Threading
 *  EVERY field explicitly is load-bearing: the `rpgGameConfigSchema.parse` in the caller would otherwise
 *  reset an OMITTED field to its default, so a host who turned deception on and then edits the steeringNote
 *  must NOT silently lose deception (or the reasoning-host-only strip / the card knobs / the orb pins that
 *  ride the same slice). `?? current` = MA-4 keep-on-omit. A NEW features field added to the schema MUST be
 *  added here too, or it silently resets on the next unrelated write ([versioned-config-lift-drops-overrides]). */
function mergeFeatures(patch: UpdateConfigParams["patch"], current: RpgGameFeatures): RpgGameFeatures {
  return {
    relationshipHints: patch?.relationshipHints ?? current.relationshipHints,
    // R4c — the custom-journal-type gloss map (the relationshipHints sibling): keep-on-omit.
    journalTypeHints: patch?.journalTypeHints ?? current.journalTypeHints,
    deception: patch?.deception ?? current.deception,
    omniscience: patch?.omniscience ?? current.omniscience,
    hiddenContentReveal: patch?.hiddenContentReveal ?? current.hiddenContentReveal,
    recentBeatsKeepLast: patch?.recentBeatsKeepLast ?? current.recentBeatsKeepLast,
    // P4 card knobs (§9 #7 + M2/M3): the teaching gate, the interactivity ASK, the keep-last-X wire knob.
    immersiveHtml: patch?.immersiveHtml ?? current.immersiveHtml,
    immersiveHtmlInteractive: patch?.immersiveHtmlInteractive ?? current.immersiveHtmlInteractive,
    cardKeepLastX: patch?.cardKeepLastX ?? current.cardKeepLastX,
    // P5 play-style knobs (§5.4/§6.4) — keep-on-omit like every sibling.
    cyoa: patch?.cyoa ?? current.cyoa,
    cyoaChoiceBehavior: patch?.cyoaChoiceBehavior ?? current.cyoaChoiceBehavior,
    plotProgression: patch?.plotProgression ?? current.plotProgression,
  };
}

/** The §1.3 extraction-depth knobs — keep-on-omit like every top-level sibling ([versioned-config-lift-drops-
 *  overrides]): an unrelated config write must never reset the depth/cadence a host tuned. Extracted so the
 *  main parse stays under the cognitive-complexity ceiling. */
function mergeExtractionKnobs(
  patch: UpdateConfigParams["patch"],
  current: RpgGameConfig,
): Pick<RpgGameConfig, "extractionContext" | "extractionWindowTokens" | "reconcileEveryBeats"> {
  return {
    extractionContext: patch?.extractionContext ?? current.extractionContext,
    extractionWindowTokens: patch?.extractionWindowTokens ?? current.extractionWindowTokens,
    reconcileEveryBeats: patch?.reconcileEveryBeats ?? current.reconcileEveryBeats,
  };
}

/** The whole keep-on-omit merge the config `parse` consumes ([versioned-config-lift-drops-overrides]: EVERY
 *  field must be threaded, or an unrelated write silently resets it to the schema default). Hoisted out of the
 *  verb so `updateConfig` stays under the cognitive-complexity ceiling. */
function mergeConfig(params: UpdateConfigParams, current: RpgGameConfig, nextProfile: RpgStatProfile | undefined): Record<string, unknown> {
  const patch = params.patch;
  return {
    // The FRONT-DOOR toggle (#40) — keep-on-omit like every sibling (an unrelated config write must
    // never silently re-engage/disengage the game).
    engaged: patch?.engaged ?? current.engaged,
    statProfile: nextProfile ?? current.statProfile,
    // THE TRACKERS (the tracked-field unification) — whole-list replace on a passed array, keep on omit.
    // The same silent-reset trap `mergeFeatures` guards: this write door is the ONLY tracker def door, so
    // an omitted `trackers` on an unrelated config edit MUST carry the current set through the parse.
    trackers: patch?.trackers !== undefined ? [...patch.trackers] : current.trackers,
    lite: { steeringNote: patch?.steeringNote ?? current.lite.steeringNote },
    extractionMode: params.extractionMode ?? current.extractionMode,
    // The §1.3 extraction-depth knobs — keep-on-omit.
    ...mergeExtractionKnobs(patch, current),
    // #9 — keep-on-omit like every sibling.
    dateMode: patch?.dateMode ?? current.dateMode,
    // The parity-plus feature knobs (§2.8/§2.1 M1 + P3 §3.3/§3.6 + P4 cards) — keep-on-omit (see mergeFeatures).
    features: mergeFeatures(patch, current.features),
    // The GAME's authored user macros (MU §12A.5 / owner ruling #20's game half) — whole-list replace on a
    // passed array, keep-on-omit like every sibling ([versioned-config-lift-drops-overrides]: without the
    // keep, an unrelated config edit would reset them to the schema default `[]`). The turn registers these
    // beside the preset's, the game winning a name clash.
    userMacros: patch?.userMacros !== undefined ? [...patch.userMacros] : current.userMacros,
  };
}

export function createUpdateConfig(ctx: RpgContext): Pick<RpgService, "updateConfig"> {
  async function updateConfig(params: UpdateConfigParams): Promise<void> {
    const { game } = await resolveHost(ctx, params.principal, params.chatId);

    if (params.extractionMode !== undefined && !(RPG_EXTRACTION_MODES as readonly string[]).includes(params.extractionMode)) {
      throw new DomainOperationError("rpg_invalid_extraction_mode", `unknown extractionMode "${params.extractionMode}"`);
    }

    const nextProfile = params.patch?.statProfile;
    if (nextProfile !== undefined) {
      await assertProfileMutable(ctx, game.id, nextProfile);
    }
    const nextConfig = rpgGameConfigSchema.parse(mergeConfig(params, game.config, nextProfile));

    await updateGame(ctx.db, game.id, {
      config: nextConfig,
      ...(params.gmPresetId !== undefined ? { gmPresetId: params.gmPresetId } : {}),
      updatedAt: ctx.now(),
    });

    // #40 — an engaged flip re-writes the chat POINTER MIRROR (`ChatRpgPointer.engaged`) so the client's
    // sync takeover gate flips off the SAME `ChatDetail` read that gated it on (no rpg round-trip).
    if (params.patch?.engaged !== undefined && params.patch.engaged !== game.config.engaged) {
      await ctx.setPointer(params.chatId, { gameId: game.id, engaged: params.patch.engaged });
    }

    // The game row's config/knobs changed — the takeover + config reads refetch (§4.9).
    ctx.emitBus({ type: "gameChanged", chatId: params.chatId });
  }
  return { updateConfig };
}
