// The read-model shapes the client receives. Domain-local (the client gets them via tRPC inference, not
// a direct import), so they live in the feature's `contract/`, NOT `@orb/contracts` (which homes only
// the cross-boundary `PromptConfig` / `UserIntent` / guided-action shapes the view CARRIES).
// `isSystemDefault` is the derived signal that lets the client identify the un-owned row without the
// domain-internal `SYSTEM_DEFAULT_PRESET_ID` sentinel.

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import type { ModelId, PresetId } from "@orb/kit/ids";

export interface PresetSummary {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  /** Derived (`id === SYSTEM_DEFAULT_PRESET_ID`): the one shared system-default row. Editing it COWs into a
   *  fork. Ownerless PACKAGED template rows are NOT flagged here — they never surface in the readable list. */
  readonly isSystemDefault: boolean;
  /** Fork lineage (`presets.forked_from`, null = born here): the preset this row was copied from — the
   *  system default for a copy-on-write fork, a PACKAGED template for a `clonePackaged` copy. The ID only
   *  (`ChatSummary.parentChatId`-style); the client resolves the NAME from the rows it already has and
   *  simply omits the lineage scent when the source is not among them (a packaged template never is). */
  readonly forkedFrom: PresetId | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PresetDetail extends PresetSummary {
  readonly config: PromptConfig;
  readonly schemaVersion: number;
  /**
   * WHY THE `config` ABOVE MAY NOT BE THIS ROW'S (#1716) — `null` ⇒ the stored blob was read faithfully;
   * a failure kind ⇒ `config` is a STAND-IN (the schema default, or for `version-from-future` the stored
   * blob minus every field this build cannot represent) and the editor is looking at something the row
   * does not contain.
   *
   * IT IS THE READ-TIME TWIN OF THE WRITE REFUSAL, and that is the whole point of putting it on the wire.
   * Since #1026 a config write derived from this read is refused with `stored_config_unreadable`
   * (`#kit/stored-config`), so before this field the user saw a defaults-looking editor, typed into it, and
   * got a generic save failure — the refusal was correct and completely invisible until it was too late.
   * It is projected from the SAME `promptConfigConfig.parseOutcome(row.config, row.schemaVersion)` call the
   * guard makes (`../substrate/views.ts`), so the state the editor renders cannot disagree with the refusal
   * the write would produce.
   *
   * The KIND crosses, not just a boolean, because the two failures have OPPOSITE repairs: a
   * `version-from-future` blob is intact data this build is too old to read (reset-to-default would DESTROY
   * a newer build's preset), while the rest are genuine corruption whose only way out IS reset/import.
   * Naming the kind is leak-free — it is a verdict about the blob, never its contents (the same posture the
   * refusal message keeps).
   */
  readonly configUnreadable: VersionedParseFailure | null;
}

/**
 * WHERE THIS PRESET IS BOUND FROM OUTSIDE THE LIBRARY (#279) — the CONTEXT panel's backward-bindings block.
 *
 * The library is full of forward readouts ("what does this preset set"); nothing answered "what would break
 * if I changed it". The honest answer is short, and the SHAPE of it is the finding: a chat does NOT carry a
 * preset. A room generates under its HOST's active preset (`UserSettings.seeds.defaultPresetId`, resolved
 * per turn at `entry/compose/chat.ts::resolvePromptConfigFor`), so there is no per-chat preset column to
 * roster. Exactly TWO bindings exist on this tree:
 *   • `isUserDefault` — this preset IS the caller's active pick, i.e. every room they host runs it. One
 *     boolean, not a room list: enumerating "every chat you host" would restate the chats list, and it is
 *     the SETTING that is the binding.
 *   • `gmRooms` — `rpg_games.gmPresetId`, the GM-voice preset REDIRECT (rpg §4.11 #1), which IS per-room and
 *     overrides the default for that room's narrator turns. Membership-scoped like every room read (D18):
 *     resolved through the shared `resolveVisibleRooms`, so a game in a room the caller has left is absent.
 *
 * There is deliberately NO role/connection arm. A connection binds MODELS to roles; a preset is generation
 * config and is never referenced by a connection or a role (`domain/preset` owns params/sections only — the
 * domain map's "never the connection"). A block claiming that binding class would be inventing one.
 */
export interface PresetUsageView {
  readonly isUserDefault: boolean;
  readonly gmRooms: readonly VisibleRoomRef[];
}

// ── The EFFECTIVE profile (`resolveEffective`, redesign §4.3) ──────────────────────────────────────
// What the generation funnel ACTUALLY produces for this preset against the caller's own chat model — the
// editor's answer to "what will the next turn send?". Never a client mirror of the funnel.

/** WHY a knob has the value it has — the funnel's four rungs, plus the engine floor that stands when the
 *  funnel itself yields nothing. `clamped` wins over its own source: a value the user (or the quality dial)
 *  asked for that the capability moved is a clamp, and the deck says so. */
export const EFFECTIVE_PROVENANCES = ["explicit", "quality", "modelDefault", "clamped", "floor"] as const;
export type EffectiveProvenance = (typeof EFFECTIVE_PROVENANCES)[number];

/** The SCALAR generation knobs the funnel resolves — the KnobRow surface, in deck order. Deliberately NOT
 *  every `params` field: `logitBias`/`stop` are collection editors (no datum row), and
 *  `maxContextTokens`/`compaction.*` never enter `resolveChat` at all, so projecting them would be
 *  inventing a resolution the turn pipeline does not perform. */
export const EFFECTIVE_KNOBS = [
  "temperature",
  "topP",
  "topK",
  "minP",
  "topA",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
  "seed",
  "effort",
  "thinkingBudgetTokens",
  "thinkingDisplay",
  "maxOutputTokens",
  "verbosity",
] as const;
export type EffectiveKnob = (typeof EFFECTIVE_KNOBS)[number];

/** A resolved knob: the value the wire would carry + where it came from. */
export interface EffectiveKnobReading {
  readonly value: number | string;
  readonly provenance: EffectiveProvenance;
}

/** A STORED explicit knob this model does not honor (redesign §4.2 / F7): the funnel dropped it, so it is
 *  invisible on the wire — the deck's staleness row is what makes it visible instead of silently dead. */
export interface StaleKnob {
  readonly knob: EffectiveKnob;
  readonly value: number | string;
}

/** ONE knob the quality dial feeds, as the dial declares it — NOT as the funnel resolved it. The Params
 *  surface's "quality mapping" datum ("deep → effort high · temp 1.0") answers "what does this dial DO",
 *  which is a fact about the dial and stays true whether or not an explicit knob currently overrides it.
 *  Projected server-side because `QUALITY_SAMPLING`/`QUALITY_EFFORT` are funnel vocabulary the client is
 *  banned from importing (redesign §12) — the previous client derivation could only see knobs the funnel
 *  happened to attribute to the dial, so an overridden dial rendered "everything is overridden" instead of
 *  its mapping (side-eye F-15). */
export interface QualityMappingEntry {
  readonly knob: EffectiveKnob;
  readonly value: number | string;
}

/** The dial's declared mapping, or `null` when no dial is set (there is nothing to state). */
export interface QualityMapping {
  readonly quality: string;
  readonly entries: readonly QualityMappingEntry[];
}

export interface EffectivePreset {
  readonly presetId: PresetId;
  /** The model the funnel resolved AGAINST — the readout says "resolved for <model>", and it may not lie
   *  after a model swap (the §4.4 freshness contract's capability rung). */
  readonly model: ModelId;
  /** Only the knobs that actually resolve; an absent knob means the funnel produces NOTHING for it on this
   *  model (nothing to ghost — the honest empty, never a fabricated default). */
  readonly knobs: Partial<Record<EffectiveKnob, EffectiveKnobReading>>;
  readonly stale: readonly StaleKnob[];
  /** What the QUALITY dial feeds, per the dial's own table — `null` with no dial set. */
  readonly qualityMapping: QualityMapping | null;
}
