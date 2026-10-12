// RPG CT fixtures — the `rpg.getGame` read model, BUILT BY THE PRODUCT'S OWN BIRTH DERIVATION (#900).
//
// WHY THIS EXISTS. Two CT files each hand-spelled their own `rpg.getGame` literal behind a `: unknown`
// return, and both drifted from a shape the server can mint:
//   · `publicConfig.statProfile` was `{ attributes: [] }` on a game declared `ruleset: "d20"` — a pair
//     `planLiteGameBirth` structurally cannot produce (birth sets `statProfile = RPG_RULESET_PROFILE[ruleset]`,
//     so a d20 game is BORN with the six d20 attributes), and one `RpgStatProfile` field of six.
//   · `publicConfig.dateMode` was absent from both, and `ruleset` from one — required members of
//     `RpgGameView["publicConfig"]` that the `unknown` return type made invisible to tsc.
// Neither lie changed a verdict TODAY (the dice menu keys on `ruleset` alone, the choice provider on
// `cyoaChoiceBehavior`), which is exactly the #900 hazard: a fixture the server cannot mint is a test of a
// product nobody ships, and the next reader of those fields inherits a green pin over a fiction.
//
// THE TWO ENFORCERS, both compile-time:
//   1. The return type is the real `RpgGameView`, not `unknown` — a member added to the view, or to
//      `publicConfig`, reds this file instead of silently landing as a hole in every CT that mounts a game.
//   2. The config is not spelled at all: it is `rpgGameConfigSchema.parse` over the SAME three inputs
//      `domain/rpg/game-mint.ts#planLiteGameBirth` passes, so every knob is the schema's own default and the
//      stat vocabulary is the ruleset's data. A fixture cannot invent a config a born game does not carry.
//
// `effectiveDelivery` is the one field mirrored by hand: its derivation (`deriveEffectiveDelivery`) lives in
// `@orb/server/domain/rpg/substrate/readonly-axis.ts`, and client → server is an illegal import direction, so
// this file restates the three-arm rule and cites it. That is a mirror, not a second law — if the arms move,
// this comment is the grep target.

import type { RpgEffectiveDelivery, RpgGameConfig, RpgGameView } from "@orb/contracts/rpg";
import { RPG_RULESET_DEFAULT, RPG_RULESET_PROFILE, rpgGameConfigSchema, rpgSeedTrackers } from "@orb/contracts/rpg";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";

/** The `deriveEffectiveDelivery` mirror (see header) — read-only wins outright (nothing writes, so neither
 *  "Live" nor "one beat behind" is true), otherwise the path is the mode. The `local-engine-fold-guard`
 *  fallback arm needs a guarded connection, which no CT fixture models; a story that wants it states
 *  `effectiveDelivery` and wins. */
function effectiveDeliveryOf(mode: RpgGameConfig["extractionMode"], trackersReadOnly: boolean): RpgEffectiveDelivery {
  if (trackersReadOnly) {
    return { path: "none", fallbackReason: null, structuredUnavailable: false, stateRoundOverflow: null };
  }
  return { path: mode === "folded" ? "folded" : "tool-round", fallbackReason: null, structuredUnavailable: false, stateRoundOverflow: null };
}

/**
 * A `rpg.getGame` view for a BORN lite game on `chatId`.
 *
 * `ruleset` / `features` / `extractionMode` go through the real config schema, so the vocabulary the view
 * publishes is the vocabulary the ruleset carries — pass `ruleset: "d20"` and the attributes arrive with it,
 * exactly as the product's own birth does. Everything else is the view's own projection
 * (`domain/rpg/verbs/read/get-game.ts`), stated field-for-field.
 */
export function makeRpgGameView(
  chatId: ChatId,
  overrides: {
    readonly gameId?: string;
    readonly ruleset?: RpgGameConfig["ruleset"];
    readonly features?: Partial<RpgGameConfig["features"]>;
    readonly extractionMode?: RpgGameConfig["extractionMode"];
    readonly trackersReadOnly?: boolean;
    readonly canPopulate?: boolean;
    readonly effectiveDelivery?: RpgEffectiveDelivery;
  } = {},
): RpgGameView {
  const ruleset = overrides.ruleset ?? RPG_RULESET_DEFAULT;
  // THE BIRTH DERIVATION, verbatim (`domain/rpg/game-mint.ts#planLiteGameBirth`): the ruleset is the ONE
  // stored choice and the vocabulary is its data — never a second value a fixture gets to pick.
  const statProfile = RPG_RULESET_PROFILE[ruleset];
  const config = rpgGameConfigSchema.parse({
    ruleset,
    statProfile,
    trackers: rpgSeedTrackers(statProfile),
    lite: { steeringNote: "" },
    ...(overrides.features === undefined ? {} : { features: overrides.features }),
    ...(overrides.extractionMode === undefined ? {} : { extractionMode: overrides.extractionMode }),
  });
  const trackersReadOnly = overrides.trackersReadOnly ?? false;
  return {
    id: castId<RpgGameId>(overrides.gameId ?? "rpg_game_ct"),
    chatId,
    mode: "lite",
    status: "active",
    trackersReadOnly,
    canPopulate: overrides.canPopulate ?? false,
    extractionMode: config.extractionMode,
    effectiveDelivery: overrides.effectiveDelivery ?? effectiveDeliveryOf(config.extractionMode, trackersReadOnly),
    publicConfig: {
      statProfile: config.statProfile,
      ruleset: config.ruleset,
      dateMode: config.dateMode,
      immersiveHtml: config.features.immersiveHtml,
      cyoa: config.features.cyoa,
      cyoaChoiceBehavior: config.features.cyoaChoiceBehavior,
      plotProgression: config.features.plotProgression,
    },
  };
}

// A `rpg.getConfigView` stub — the HOST GM-console read (steering note, delivery model, the TRACKER defs,
// relationship hints, the deception knobs). Empty-but-valid defaults; the console renders it.
export function makeRpgConfigView(
  macros: TrpcWireOutput<"rpg.getConfigView">["userMacros"] = [],
  presetNames: readonly string[] = [],
  gmPresetId: string | null = null,
): TrpcWireOutput<"rpg.getConfigView"> {
  return {
    statProfile: {
      attributes: [{ key: "str", label: "Strength", hint: "raw power" }],
      range: { min: 1, max: 20 },
      modifier: { center: 10, step: 2 },
      skillGoverning: {},
      defaultAttribute: "str",
      perceptionAttribute: "str",
      resolution: { kind: "house-d20" },
    },
    ruleset: "freeform",
    dateMode: "structured",
    steeringNote: "Keep the tone grim.",
    // #1032 — the GM-VOICE knob. Default null (the born "your own preset" arm every other pin here drives).
    gmPresetId,
    extractionMode: "cheap",
    trackers: [
      {
        key: "trust",
        label: "Trust",
        shape: "text",
        write: "set",
        subject: "actor",
        appliesTo: "npcs",
        max: null,
        hint: "",
        color: null,
        icon: null,
        sort: 0,
        pinned: false,
        locked: false,
      },
    ],
    relationshipHints: { debtor: "owes the party a debt" },
    journalTypeHints: {},
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 6,
    // The §1.3 extraction-depth trio the scalar form now edits (`toHostConsoleForm` reads all three).
    extractionContext: "window",
    stateCaptureVehicle: "auto",
    extractionWindowTokens: 4096,
    reconcileEveryBeats: 10,
    // The P4/P5 knobs the scalar form projects (`toHostConsoleForm`).
    immersiveHtml: false,
    immersiveHtmlInteractive: false,
    cardKeepLastX: 3,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
    // WAVE MU — the two macro-editor fields: the GAME's own authored macros and the NAMES the chat's active
    // preset declares (the shadow gloss). Overridable per test.
    userMacros: macros,
    presetMacroNames: presetNames,
  };
}

/** An empty `rpg.getTrackerView`: no ambient scene, no actors, no trackers, nothing locked. */
export function makeRpgTrackerView(overrides: Partial<TrpcWireOutput<"rpg.getTrackerView">> = {}): TrpcWireOutput<"rpg.getTrackerView"> {
  return {
    ambient: null,
    actors: [],
    cast: [],
    trackerDefs: [],
    gameTrackers: [],
    quests: [],
    plot: null,
    recentBeats: [],
    trackersReadOnly: false,
    trackerOrbs: [],
    lockedPaths: [],
    ...overrides,
  };
}
