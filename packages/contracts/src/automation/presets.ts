// @orb/contracts/automation — the RULE-PRESET wire slice (S3). A preset is the user-facing vocabulary of the
// automation platform: a named, knob-parameterized recipe that MINTS an ordered set of ordinary
// `automation_rules` rows through the existing `createRule` validation. Nothing here is a second rule model —
// after a mint the rows are indistinguishable from hand-authored ones (v1's knob-EDIT path is re-mint, so no
// `preset_id`/`knobs` provenance column exists; the post-mint flip shape is recorded-unbuilt in the
// interaction-direction spec §3-S3).
//
// WHAT LIVES HERE vs the domain: the ID TUPLE + the client-visible PROJECTION (id/title/summary/knob
// descriptors) — the picker's whole read model. The CEL predicate sources, the arm templates and the mint
// handlers stay DOMAIN-side (`domain/automation/contract/presets.ts`): a predicate is server logic, not wire
// vocabulary, and the client never re-derives one.
//
// The knob descriptor is a DISCRIMINATED union on `kind`, so a picker's editor dispatch is exhaustive
// (`RULE_PRESET_KNOB_KINDS` + a mapped-type Record — the §5.5 discipline) and the DOMAIN side derives each
// knob's resolved VALUE type from its descriptor (`RulePresetKnobValueOf`), which is what makes a preset
// builder's `knobs.everyN` a compile-checked `number` rather than a stringly bag.

import { z } from "zod";

/** The committed preset catalogue's ids — the A3-riding v1 rows of the §4 catalogue. The domain holds an
 *  exhaustive `Record<RulePresetId, …>` over this tuple, so a new id without a definition fails `tsc`.
 *  Ids are camelCase (they are Record PROPERTY keys, not data literals — `useNamingConvention`). */
export const RULE_PRESET_IDS = [
  /** §4 #1 — the welcome-back recap: a confirm-first CARD after an idle gap (two rules). */
  "welcomeBackRecap",
  /** §4 #3 — auto-add lore entries, confirm-first by default. */
  "autoAddLore",
  /** §4 #4 — a guided pacing turn every N beats. */
  "pacingNudge",
  /** §4 #5 — a scene illustration on a cadence. */
  "illustrateScenes",
  /** §4 #6 — diegetic dice chips after a beat. */
  "diceChips",
  /** §4 #7 — the two-rule clock: a counter that fills, then fires and resets. */
  "clockFires",
  /** §4 #8 — the opener deck: compose-mode staples the member owns and edits. */
  "openerChips",
  /** §4 #9 — a diegetic veil word redirects the scene. */
  "sceneVeil",
  /** §4 #10 — call a vote: send-mode chips, raised on demand (R7), never on its own. */
  "callAVote",
  /** §4 #12 — the two-rule callback: an unresolved promise resurfaces D beats later. */
  "callback",
  /** §4 #13 — a short cutaway every N beats. */
  "cutaways",
] as const;
export type RulePresetId = (typeof RULE_PRESET_IDS)[number];
export const rulePresetIdSchema = z.enum(RULE_PRESET_IDS);

/** The knob editor kinds. A new kind fails every exhaustive descriptor dispatch (`tsc`). */
export const RULE_PRESET_KNOB_KINDS = ["number", "text", "textList", "choice"] as const;
export type RulePresetKnobKind = (typeof RULE_PRESET_KNOB_KINDS)[number];

/** Shared by every descriptor: what the picker labels the field, and the optional one-line help under it. */
interface RulePresetKnobBase {
  readonly label: string;
  readonly help?: string;
}

/** An integer knob (a cadence N, a beat distance D, a threshold). `min`/`max` are the picker's bounds AND
 *  the mint-time clamp — an out-of-range override is a typed refusal, never a silent clamp. */
export interface RulePresetNumberKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "number";
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

/** A free-text knob (a steer line, a veil word). `maxLength` mirrors the arm cap the value lands in, so a
 *  refusal happens at the knob rather than deep inside `automationActionSchema`. */
export interface RulePresetTextKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "text";
  readonly default: string;
  readonly maxLength: number;
}

/** A list-of-strings knob (chip labels, the callback patterns). `minItems` is load-bearing, not decoration:
 *  an emptied list would build a degenerate CEL predicate (`(...)` with no disjunct) or a zero-choice chip
 *  arm — both are mint-time refusals rather than a rule that stores and then errors every event. */
export interface RulePresetTextListKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "textList";
  readonly default: readonly string[];
  readonly minItems: number;
  readonly maxItems: number;
  readonly maxLength: number;
}

/** A one-of knob. Generic in its OPTION literal union so a preset builder reading it gets the narrow type
 *  (e.g. a `PromptTemplateMode` subset) rather than a bare `string` — the default parameter is what lets the
 *  erased union below stay one type. */
export interface RulePresetChoiceKnobDescriptor<TOption extends string = string> extends RulePresetKnobBase {
  readonly kind: "choice";
  readonly options: readonly TOption[];
  readonly default: TOption;
}

/** One knob's editor descriptor — the picker's exhaustive dispatch axis. */
export type RulePresetKnobDescriptor =
  | RulePresetNumberKnobDescriptor
  | RulePresetTextKnobDescriptor
  | RulePresetTextListKnobDescriptor
  | RulePresetChoiceKnobDescriptor;

/** The VALUE type a descriptor resolves to. The domain's `ResolvedRulePresetKnobs` maps a preset's knob schema
 *  through this, which is what makes every preset builder's knob reads compile-checked. */
export type RulePresetKnobValueOf<TKnob extends RulePresetKnobDescriptor> = TKnob extends RulePresetNumberKnobDescriptor
  ? number
  : TKnob extends RulePresetTextKnobDescriptor
    ? string
    : TKnob extends RulePresetTextListKnobDescriptor
      ? readonly string[]
      : TKnob extends RulePresetChoiceKnobDescriptor<infer TOption>
        ? TOption
        : never;

/** A knob value on the wire — the union every descriptor kind resolves into. */
export type RulePresetKnobValue = number | string | readonly string[];

/** The wire validator for a caller's knob OVERRIDES (the mint's optional partial bag). Shape-only: the
 *  per-knob kind/bound check is the domain's, against the named preset's own descriptors. */
export const rulePresetKnobValuesSchema = z.record(z.string(), z.union([z.number(), z.string(), z.array(z.string())]));

/** One knob descriptor as the picker reads it — the descriptor plus the key it is addressed by (the domain
 *  holds knobs as a keyed schema; the projection flattens it). */
export type RulePresetKnobView = RulePresetKnobDescriptor & { readonly key: string };

/** The preset picker's read model (`listRulePresets`). Carries NO CEL and NO arm templates — a preset's
 *  predicates are server logic; the client picks an id + knob values and the mint verb does the rest. */
export interface RulePresetView {
  readonly id: RulePresetId;
  readonly title: string;
  /** One plain sentence: what enabling this does to the room. */
  readonly summary: string;
  /** How many rules the mint creates (titled `<title> (i/n)` when it mints more than one). */
  readonly ruleCount: number;
  /** S4: the preset's fires SUGGEST rather than act. Carried here at A3 (the def declares it and the view
   *  projects it); the suggestion machinery itself is A4's. */
  readonly confirmFirst: boolean;
  readonly knobs: readonly RulePresetKnobView[];
}
