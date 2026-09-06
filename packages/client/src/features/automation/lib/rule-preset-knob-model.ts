// B2 — the rule-preset knob VALUE MODEL: what the picker's form holds for one knob, what counts as a
// usable value, and how a blocked mint names what is missing. Pure over the wire descriptors — no React,
// no network — so the editors (`components/rule-preset-knob-field.tsx`) and the mint ceremony
// (`components/rule-preset-picker.tsx`) share ONE answer to "is this knob filled in?".
//
// The guards here are defense-in-depth against a server whose knob DEFAULTS bypass their own bounds
// (`substrate/presets.ts::resolveKnob` returns a descriptor default UNVALIDATED — A3-verify): a number
// default is re-derived in range, and a knob with no admissible value reports an issue the picker blocks
// the mint on rather than discovering it in a round-trip refusal.
//
// Every refusal string here MIRRORS the server's own wording for the same case, so a field's inline issue
// and a raced round-trip toast say the same sentence.

// The form's value shape is the CONTRACT's `RulePresetKnobValueInput(s)` — the mint's own wire-input bag,
// derived from `rulePresetKnobValuesSchema`. The client does not re-spell it: its mutable `string[]` arm is
// exactly what a `textList` editor needs (the RESOLVED `RulePresetKnobValue` carries `readonly string[]`,
// which will not assign into the wire), and one home means a wire reshape lands here as a tsc error.
// `textList` values keep blank lines while editing; they are cleaned at validate/mint time.

import type { RulePresetKnobDescriptor, RulePresetKnobValueInput, RulePresetKnobValueInputs, RulePresetKnobView } from "@orb/contracts/automation";
import { RULE_PRESET_ENTITY_NOUNS } from "@orb/contracts/automation";

export function clampKnobNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** One knob's default value — the descriptor default, with a number default CLAMPED to its own bounds.
 *  An `entityRef` carries NO default by construction (no entity is "the" entity), so it starts unchosen —
 *  the empty string is "nothing picked yet", never a value that could reach a mint. */
function defaultForKnob(knob: RulePresetKnobDescriptor): RulePresetKnobValueInput {
  switch (knob.kind) {
    case "number":
      return clampKnobNumber(knob.default, knob.min, knob.max);
    case "text":
      return knob.default;
    case "textList":
      return [...knob.default];
    case "choice":
      return knob.default;
    case "entityRef":
      return "";
    default: {
      const exhaustive: never = knob;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The non-empty lines of a textList value (its editing form keeps blank lines; the mint wants the clean set).
 *  Narrows off the value UNION (not `Array.isArray`, which tsc cannot reduce back to `string[]` here). */
function cleanTextList(value: RulePresetKnobValueInput | undefined): string[] {
  if (value === undefined || typeof value === "number" || typeof value === "string") {
    return [];
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** The per-knob validity issue a host must resolve before the mint, or `null` when the value is admissible.
 *  Mirrors the server's `resolveKnob` refusals so the block happens at the field, not as a toast after the
 *  round trip — a text knob is never validly empty, and an `entityRef` is never validly unchosen. */
export function knobIssue(knob: RulePresetKnobDescriptor, value: RulePresetKnobValueInput | undefined): string | null {
  switch (knob.kind) {
    case "number":
      return null; // clamped on entry — always in range.
    case "text": {
      // Mirrors the server's OWN floor (`substrate/presets.ts::resolveText`), not a blanket "never
      // empty" — a `minLength: 0` knob (`storyPacing`'s "Standing direction", "" = none) is validly
      // blank, and blocking it here would make a documented-optional field unreachable (#1387).
      if (knob.minLength === 0) {
        return null;
      }
      return typeof value === "string" && value.trim().length >= knob.minLength ? null : "Required.";
    }
    case "entityRef":
      return typeof value === "string" && value.length > 0 ? null : `Choose a ${RULE_PRESET_ENTITY_NOUNS[knob.entity]}.`;
    case "textList": {
      const entries = cleanTextList(value);
      if (entries.length < knob.minItems) {
        return `Add at least ${knob.minItems}.`;
      }
      if (entries.length > knob.maxItems) {
        return `At most ${knob.maxItems}.`;
      }
      return null;
    }
    case "choice":
      return null; // a Select can only hold one of the declared options.
    default: {
      const exhaustive: never = knob;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The default value bag for a preset — every declared knob at its (clamped) descriptor default. */
export function defaultKnobValues(knobs: readonly RulePresetKnobView[]): RulePresetKnobValueInputs {
  const values: RulePresetKnobValueInputs = {};
  for (const knob of knobs) {
    values[knob.key] = defaultForKnob(knob);
  }
  return values;
}

/** The override bag to send at mint — textList knobs cleaned to their non-empty entries; everything else as
 *  held. Every declared key is sent (all are valid keys), so the verb resolves defaults only where a value
 *  is missing. */
export function mintKnobOverrides(knobs: readonly RulePresetKnobView[], values: RulePresetKnobValueInputs): RulePresetKnobValueInputs {
  const overrides: RulePresetKnobValueInputs = {};
  for (const knob of knobs) {
    overrides[knob.key] = knob.kind === "textList" ? [...cleanTextList(values[knob.key])] : (values[knob.key] ?? "");
  }
  return overrides;
}

/** The line above a blocked Add naming what is missing. "Fill in" is a TYPING instruction and would be a
 *  small lie over a chooser — an entityRef is picked, not filled.
 *
 *  THE PURE DEFAULT, not the whole answer (#655). An `entityRef` whose chooser has NOTHING to offer is
 *  blocked on a PREREQUISITE, not on a choice, and "Choose a world book to add this rule." is then an
 *  instruction the host cannot obey — but which door to name is a live chat-scoped read, which is not this
 *  module's business (it is pure over the descriptors by construction). `KnobBlockingLine`, in
 *  `components/rule-preset-knob-field.tsx`, owns that override and falls back here for every other case. */
export function knobBlockingLine(knob: RulePresetKnobView): string {
  const descriptor: RulePresetKnobDescriptor = knob;
  return descriptor.kind === "entityRef"
    ? `Choose a ${RULE_PRESET_ENTITY_NOUNS[descriptor.entity]} to add this rule.`
    : `Fill in "${knob.label}" to add this rule.`;
}
