// domain/rpg/verbs/game/update-config — updateConfig (docs/plans/rpg/design.md). The ONE config write door: the
// profile mutability matrix (§2.3), the `steeringNote`, and the `gmPresetId` + `extractionMode` KNOBS (§4.11 #1
// + the delivery-model amendment). Host-gated.
//
// It is also the RULESET door (#862): the setting the Game tab's segmented control writes. The apply is
// ADDITIVE by owner ruling (2026-08-30) and the law lives in contracts (`applyRulesetVocabulary`) — the verb
// only decides WHEN it runs (on a real change) and commits the result.

import type { RpgGameConfig, RpgGameFeatures, RpgStatProfile, RpgTrackerDef } from "@orb/contracts/rpg";
import { applyRulesetVocabulary, RPG_CONFIG_MAX_TRACKERS, RPG_EXTRACTION_MODES, rpgGameConfigSchema } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { RpgGameId } from "@orb/kit/ids";
import type { UpdateConfigParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { updateGame } from "../../persistence/games.ts";
import { listSheets } from "../../persistence/sheets.ts";

/** The profile's SELF-coherence, independent of any sheet (#1371 item 2). Three states
 *  `rpgStatProfileSchema` permits and no consumer can honestly use: a duplicate attribute `key` (a sheet's
 *  `attributes` record can only hold one, so the second definition is unreachable vocabulary), an inverted
 *  `range`, and a `defaultAttribute`/`perceptionAttribute` naming a key the profile does not declare —
 *  which `attributeReading` then prints as its raw key. `""` is the DECLARED "unset" value (the packaged
 *  `freeform` profile ships both empty) and stays legal.
 *
 *  Enforced HERE and not as a zod refine because `rpgGameConfigSchema` is parse-on-read: a refine would
 *  make an existing bad blob permanently unreadable rather than refusing the write that creates one. The
 *  contract-side header (`@orb/contracts/rpg` profile.ts, `rpgStatProfileSchema`) records that trade.
 *
 *  WHOLE-ENVELOPE REFUSAL IS DELIBERATE HERE, unlike the ST-import mapper's per-field `dropped: [...]`
 *  list (#1532 sweep-record — a REVIEW asked whether this should align with that shape instead). The two
 *  are different problem classes: the import mapper drops UNMAPPABLE FOREIGN fields the host never edited
 *  in orb's own vocabulary — silently ignoring a field ST carries that orb has no seat for costs nothing
 *  the host authored. A duplicate attribute key / dangling reference is not an unmappable field; it is a
 *  LOGICAL CONTRADICTION inside the host's OWN edit of orb's own vocabulary, and every violation here
 *  names a field this profile's OTHER fields still point at (a `defaultAttribute` naming a key that would
 *  be "dropped", a `skillGoverning` entry governing an attribute that would be "dropped") — silently
 *  dropping the offending piece would either leave a dangling reference the drop was supposed to prevent,
 *  or require ALSO silently rewriting the fields that reference it, which is a bigger unannounced edit
 *  than the one the host asked for. Refusing the whole submission and telling the host exactly which
 *  invariant broke is the honest response to a self-contradictory edit; ends if a future coherence rule is
 *  provably independent of every other field (then it can drop in isolation like an import mapper does). */
function assertProfileCoherent(next: RpgStatProfile): void {
  const seen = new Set<string>();
  for (const attr of next.attributes) {
    if (seen.has(attr.key)) {
      throw new DomainOperationError("rpg_profile_duplicate_attribute", `attribute key "${attr.key}" is declared twice`);
    }
    seen.add(attr.key);
  }
  if (next.range.min > next.range.max) {
    throw new DomainOperationError("rpg_profile_inverted_range", `range min ${next.range.min} exceeds max ${next.range.max}`);
  }
  for (const [field, key] of [
    ["defaultAttribute", next.defaultAttribute],
    ["perceptionAttribute", next.perceptionAttribute],
  ] as const) {
    if (key !== "" && !seen.has(key)) {
      throw new DomainOperationError("rpg_profile_dangling_attribute", `${field} names undeclared attribute "${key}"`);
    }
  }
}

/** The tracker list's coherence (#1371 item 3). Values are keyed by `key` on every snapshot plane, so two
 *  defs sharing one key make the second unreachable AND make a value's owning def ambiguous; and the array
 *  had no cap at all while every sibling vocabulary carries one. Same placement reasoning as
 *  {@link assertProfileCoherent} — a write-door refusal, never a parse-on-read bound. */
function assertTrackersCoherent(trackers: readonly RpgTrackerDef[]): void {
  if (trackers.length > RPG_CONFIG_MAX_TRACKERS) {
    throw new DomainOperationError("rpg_too_many_trackers", `${trackers.length} trackers exceeds the cap of ${RPG_CONFIG_MAX_TRACKERS}`);
  }
  const seen = new Set<string>();
  for (const def of trackers) {
    if (seen.has(def.key)) {
      throw new DomainOperationError("rpg_duplicate_tracker_key", `tracker key "${def.key}" is defined twice`);
    }
    seen.add(def.key);
  }
}

/** Assert a profile change is legal against the game's existing sheets (§2.3 mutability). Adds are always
 *  legal; a REMOVED attribute key must be referenced by NO sheet (attributes record) NOR the profile's own
 *  `skillGoverning` map — a referenced-remove is refused. */
async function assertProfileMutable(ctx: RpgContext, gameId: RpgGameId, next: RpgStatProfile): Promise<void> {
  assertProfileCoherent(next);
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
  // THE RULESET SETTING (#862, owner ruling 2026-08-30 — ADDITIVE). A CHANGED ruleset merges that ruleset's
  // vocabulary (attributes · skill map · seeded trackers) BESIDE what the game already carries; nothing is
  // removed, renamed or confirmed, and switching back hides nothing (`freeform` adds nothing). The apply is
  // gated on an actual CHANGE, never on presence: re-sending the current arm must not resurrect a packaged
  // attribute or tracker the host deleted afterwards. An explicit `statProfile` in the same patch WINS (the
  // stat-profile editor is authoring the vocabulary directly) — the merge then runs on that authored profile.
  const ruleset = patch?.ruleset ?? current.ruleset;
  const rulesetChanged = patch?.ruleset !== undefined && patch.ruleset !== current.ruleset;
  const base = { statProfile: nextProfile ?? current.statProfile, trackers: patch?.trackers !== undefined ? [...patch.trackers] : current.trackers };
  const vocabulary = rulesetChanged ? applyRulesetVocabulary(base, ruleset) : base;
  return {
    ruleset,
    // The FRONT-DOOR toggle (#40) — keep-on-omit like every sibling (an unrelated config write must
    // never silently re-engage/disengage the game).
    engaged: patch?.engaged ?? current.engaged,
    statProfile: vocabulary.statProfile,
    // THE TRACKERS (the tracked-field unification) — whole-list replace on a passed array, keep on omit.
    // The same silent-reset trap `mergeFeatures` guards: this write door is the ONLY tracker def door, so
    // an omitted `trackers` on an unrelated config edit MUST carry the current set through the parse. A
    // ruleset CHANGE appends its seeded defs to whichever of those two the caller produced.
    trackers: vocabulary.trackers,
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
    // NO `prose` ARM: the reminder teach/heading overrides are PRESET-homed
    // (`promptConfig.prose`, the Templates tab). This door writes game state only.
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
    // AFTER the merge, not on `patch.trackers`: the ruleset apply can ADD seeded trackers to what the patch
    // sent, so the cap and the key-uniqueness rule have to judge the list that will actually be stored.
    assertTrackersCoherent(nextConfig.trackers);

    await updateGame(ctx.db, game.id, {
      config: nextConfig,
      ...(params.gmPresetId !== undefined ? { gmPresetId: params.gmPresetId } : {}),
      updatedAt: ctx.now(),
    });

    // #40 — an engaged flip re-writes the chat POINTER MIRROR (`ChatRpgPointer.engaged`) so the client's
    // sync takeover gate flips off the SAME `ChatDetail` read that gated it on (no rpg round-trip).
    // Replay an explicit mirror write even when the game row already equals the request. That equality is the
    // exact state left by an interruption after `updateGame` but before `setPointer`; using it as a skip gate
    // made the ordinary retry preserve the split forever. The chat write is an idempotent value mirror.
    if (params.patch?.engaged !== undefined) {
      await ctx.setPointer(params.chatId, { gameId: game.id, engaged: params.patch.engaged });
    }

    // The game row's config/knobs changed — the takeover + config reads refetch (§4.9).
    ctx.emitBus({ type: "gameChanged", chatId: params.chatId });
  }
  return { updateConfig };
}
