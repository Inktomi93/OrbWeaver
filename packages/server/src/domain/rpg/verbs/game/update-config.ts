// domain/rpg/verbs/game/update-config — updateConfig (rpg-design/05 §4.4). The ONE config write door: the
// profile mutability matrix (§2.3), the `steeringNote`, and the `gmPresetId` + `extractionMode` KNOBS (§4.11 #1
// + the delivery-model amendment). Host-gated.

import type { RpgGameFeatures, RpgStatProfile } from "@orb/contracts/rpg";
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

/** Merge the parity-plus feature knobs (§2.8/§2.1 M1 + P3 §3.3/§3.6) — omit keeps the EXISTING value (a passed
 *  array/record/scalar REPLACES; the host owns these authoritatively). Threading EVERY field explicitly is
 *  load-bearing: the `rpgGameConfigSchema.parse` in the caller would otherwise reset an OMITTED field to its
 *  default, so a host who turned deception on and then edits the steeringNote must NOT silently lose deception
 *  (or the reasoning-host-only strip that rides it). `?? current` = MA-4 keep-on-omit. */
function mergeFeatures(patch: UpdateConfigParams["patch"], current: RpgGameFeatures): RpgGameFeatures {
  return {
    castFields: [...(patch?.castFields ?? current.castFields)],
    relationshipHints: patch?.relationshipHints ?? current.relationshipHints,
    deception: patch?.deception ?? current.deception,
    omniscience: patch?.omniscience ?? current.omniscience,
    hiddenContentReveal: patch?.hiddenContentReveal ?? current.hiddenContentReveal,
    recentBeatsKeepLast: patch?.recentBeatsKeepLast ?? current.recentBeatsKeepLast,
    // ORB-PINNING (§4.8): whole-list replace on a passed array; keep on omit.
    pinnedOrbs: patch?.pinnedOrbs !== undefined ? [...patch.pinnedOrbs] : current.pinnedOrbs,
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
    const nextConfig = rpgGameConfigSchema.parse({
      statProfile: nextProfile ?? game.config.statProfile,
      lite: { steeringNote: params.patch?.steeringNote ?? game.config.lite.steeringNote },
      extractionMode: params.extractionMode ?? game.config.extractionMode,
      // The parity-plus feature knobs (§2.8/§2.1 M1 + P3 §3.3/§3.6) — merged with keep-on-omit (see mergeFeatures).
      features: mergeFeatures(params.patch, game.config.features),
    });

    await updateGame(ctx.db, game.id, {
      config: nextConfig,
      ...(params.gmPresetId !== undefined ? { gmPresetId: params.gmPresetId } : {}),
      updatedAt: ctx.now(),
    });

    // The game row's config/knobs changed — the takeover + config reads refetch (§4.9).
    ctx.emitBus({ type: "gameChanged", chatId: params.chatId });
  }
  return { updateConfig };
}
