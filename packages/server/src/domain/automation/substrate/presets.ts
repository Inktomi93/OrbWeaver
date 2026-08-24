// domain/automation/substrate/presets — the preset MINT substrate: resolve a caller's partial knob overrides
// against a preset's own descriptors (a typed refusal on anything off-shape or out of bounds), and project a
// def onto the picker's `RulePresetView`.
//
// WHY resolution is the erasure boundary's proof: `contract/presets.ts` erases each def's knob generic so the
// registry can be one exhaustive Record, and its builders read the bag as their own `TKnobs`. That cast is
// sound EXACTLY BECAUSE this pass runs first and refuses any bag that is not that schema — every declared key
// present, every value of its declared kind and within its declared bounds. A bad override never reaches a
// builder; it becomes a `RuleValidationError` (BAD_REQUEST) at the verb.
//
// Bounds are refused, never clamped: a host who typed 500 for a 2..200 cadence made a mistake worth telling
// them about, and a silent clamp is the kind of quiet wrongness this codebase's gates exist to prevent.

import type { RulePresetKnobDescriptor, RulePresetKnobValue, RulePresetKnobView, RulePresetView } from "@orb/contracts/automation";
import { RuleValidationError } from "../contract/errors.ts";
import type { ErasedRulePresetDef, RulePresetKnobOverrides, RulePresetKnobSchema } from "../contract/presets.ts";

function refuse(key: string, reason: string): never {
  throw new RuleValidationError("preset_knob", `knob '${key}': ${reason}`);
}

function resolveNumber(key: string, descriptor: Extract<RulePresetKnobDescriptor, { kind: "number" }>, raw: RulePresetKnobValue | undefined): number {
  if (raw === undefined) {
    return descriptor.default;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return refuse(key, "expected a whole number");
  }
  if (raw < descriptor.min || raw > descriptor.max) {
    return refuse(key, `must be between ${descriptor.min} and ${descriptor.max}`);
  }
  return raw;
}

function resolveText(key: string, descriptor: Extract<RulePresetKnobDescriptor, { kind: "text" }>, raw: RulePresetKnobValue | undefined): string {
  if (raw === undefined) {
    return descriptor.default;
  }
  if (typeof raw !== "string") {
    return refuse(key, "expected text");
  }
  if (raw.length === 0) {
    return refuse(key, "must not be empty");
  }
  if (raw.length > descriptor.maxLength) {
    return refuse(key, `must be at most ${descriptor.maxLength} characters`);
  }
  return raw;
}

function resolveTextList(
  key: string,
  descriptor: Extract<RulePresetKnobDescriptor, { kind: "textList" }>,
  raw: RulePresetKnobValue | undefined,
): readonly string[] {
  if (raw === undefined) {
    return descriptor.default;
  }
  // Narrow off the value UNION, not `Array.isArray`: the scalar arms are what a list knob must refuse, and
  // `Array.isArray` on a union produces an intersection tsc can't reduce back to `readonly string[]`. Entry
  // TYPE is the wire schema's job (`rulePresetKnobValuesSchema` — `z.array(z.string())`); the per-entry
  // bounds below are this preset's.
  if (typeof raw === "number" || typeof raw === "string") {
    return refuse(key, "expected a list of text entries");
  }
  if (raw.length < descriptor.minItems || raw.length > descriptor.maxItems) {
    return refuse(key, `must have between ${descriptor.minItems} and ${descriptor.maxItems} entries`);
  }
  if (raw.some((entry) => entry.length === 0 || entry.length > descriptor.maxLength)) {
    return refuse(key, `every entry must be non-empty text of at most ${descriptor.maxLength} characters`);
  }
  return raw;
}

function resolveChoice(key: string, descriptor: Extract<RulePresetKnobDescriptor, { kind: "choice" }>, raw: RulePresetKnobValue | undefined): string {
  if (raw === undefined) {
    return descriptor.default;
  }
  if (typeof raw !== "string" || !descriptor.options.includes(raw)) {
    return refuse(key, `must be one of: ${descriptor.options.join(", ")}`);
  }
  return raw;
}

/** One knob resolved against its descriptor. Exhaustive over `kind` (`default: never` is the pin — a new
 *  descriptor kind fails `tsc` here). */
function resolveKnob(key: string, descriptor: RulePresetKnobDescriptor, raw: RulePresetKnobValue | undefined): RulePresetKnobValue {
  switch (descriptor.kind) {
    case "number":
      return resolveNumber(key, descriptor, raw);
    case "text":
      return resolveText(key, descriptor, raw);
    case "textList":
      return resolveTextList(key, descriptor, raw);
    case "choice":
      return resolveChoice(key, descriptor, raw);
    default: {
      const exhaustive: never = descriptor;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Resolve a caller's overrides into the COMPLETE, validated knob bag a preset's builder reads. An override
 *  naming a knob the preset does not declare is a refusal, not a silent drop — a typo'd knob key would
 *  otherwise mint a preset silently running its defaults. */
export function resolveRulePresetKnobs(knobs: RulePresetKnobSchema, overrides: RulePresetKnobOverrides): Readonly<Record<string, RulePresetKnobValue>> {
  const unknownKey = Object.keys(overrides).find((key) => !Object.hasOwn(knobs, key));
  if (unknownKey !== undefined) {
    throw new RuleValidationError("preset_knob", `knob '${unknownKey}' is not a knob of this rule preset`);
  }
  const resolved: Record<string, RulePresetKnobValue> = {};
  for (const [key, descriptor] of Object.entries(knobs)) {
    resolved[key] = resolveKnob(key, descriptor, overrides[key]);
  }
  return resolved;
}

/** Project a def onto the picker's read model — the knob schema flattened to a keyed list. Carries no CEL
 *  and no arm templates (those are server logic; the client picks an id + knob values). */
export function toRulePresetView(def: ErasedRulePresetDef): RulePresetView {
  const knobs: RulePresetKnobView[] = Object.entries(def.knobs).map(([key, descriptor]) => ({ ...descriptor, key }));
  return { id: def.id, title: def.title, summary: def.summary, ruleCount: def.ruleCount, confirmFirst: def.confirmFirst, knobs };
}
