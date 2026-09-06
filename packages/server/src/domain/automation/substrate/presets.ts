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

import type {
  RulePresetId,
  RulePresetKnobDescriptor,
  RulePresetKnobValue,
  RulePresetKnobValues,
  RulePresetKnobView,
  RulePresetView,
} from "@orb/contracts/automation";
import { RULE_PRESET_ENTITY_NOUNS, RULE_PRESET_ENTITY_REF_SCHEMAS, SPEND_ARM_TYPES } from "@orb/contracts/automation";
import { RuleValidationError } from "../contract/errors.ts";
import type { ErasedRulePresetDef, RulePresetKnobOverrides, RulePresetKnobSchema } from "../contract/presets.ts";
import { RULE_PRESETS } from "../contract/presets.ts";

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
  // The descriptor's OWN floor (#1387), not a hardcoded "non-empty": most text knobs feed an arm field
  // that is meaningless blank (`minLength: 1`), but a knob whose own semantics allow blank (`storyPacing`'s
  // "Standing direction", "" = none) declares `minLength: 0` and rides straight through.
  if (raw.length < descriptor.minLength) {
    return refuse(key, descriptor.minLength <= 1 ? "must not be empty" : `must be at least ${descriptor.minLength} characters`);
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

/** An ENTITY REFERENCE resolved against its axis. The one knob kind with NO descriptor default, and the
 *  refusal path above is exactly why: `resolveKnob` hands a descriptor default back UNVALIDATED, so a
 *  `default: ""` on a reference would ride straight into a mint and die deep inside the arm's own schema
 *  with a developer-shaped message. Here an absent override refuses at the knob, in the host's own noun —
 *  and a present one is PARSED through the axis's schema, which is what earns the branded id the preset
 *  builder reads (no `castId`). Whether the referenced entity still QUALIFIES (a book attached to this
 *  chat) stays `createRule`'s check: it is a live fact, not a shape, and it can change between the picker's
 *  render and the mint. */
function resolveEntityRef(key: string, descriptor: Extract<RulePresetKnobDescriptor, { kind: "entityRef" }>, raw: RulePresetKnobValue | undefined): string {
  const noun = RULE_PRESET_ENTITY_NOUNS[descriptor.entity];
  if (raw === undefined || raw === "") {
    return refuse(key, `choose a ${noun}`);
  }
  if (typeof raw !== "string") {
    return refuse(key, `expected a ${noun}`);
  }
  const parsed = RULE_PRESET_ENTITY_REF_SCHEMAS[descriptor.entity].safeParse(raw);
  if (!parsed.success) {
    return refuse(key, `that is not a ${noun} this app knows`);
  }
  return parsed.data;
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
    case "entityRef":
      return resolveEntityRef(key, descriptor, raw);
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

/** B10's saved-cast capture belt (build record §6.3) — resolve a caller's bag against a CHAT-scope
 *  preset's own descriptors, refusing a global one by name: a cast is a ROOM artifact, and a room's
 *  rule list structurally cannot hold a global preset's rules (`chat_id IS NULL`), so a global id in a
 *  cast is an authoring mistake worth naming, never a configuration. Exported through the front door
 *  for the roster-preset compose seam (the `resolveNotificationRecipients` posture) — the VALIDATION
 *  stays automation's one home; the caller injects it, never re-derives it. Returns the COMPLETE
 *  resolved bag (what the cast stores, and what a later re-mint hands back as overrides). */
export function resolveChatRulePresetKnobs(presetId: RulePresetId, overrides: RulePresetKnobOverrides): RulePresetKnobValues {
  const preset = RULE_PRESETS[presetId];
  if (preset.scope !== "chat") {
    throw new RuleValidationError("preset_scope", `"${preset.title}" is a library-wide rule preset — it cannot ride a saved cast`);
  }
  return resolveRulePresetKnobs(preset.knobs, overrides);
}

/** The knob value a SPEND PROBE hands a builder for one descriptor — its own default, and for the one kind
 *  that has none, a placeholder.
 *
 *  THE `entityRef` PLACEHOLDER IS A TYPE PROBE, NEVER A DEFAULT, and the distinction is the whole reason
 *  that kind carries no `default` (`@orb/contracts/automation`'s descriptor comment): a real default would
 *  ride `resolveKnob`'s unvalidated path into a MINT. Nothing here is minted, persisted, or validated — the
 *  bag exists only to make the builder run so its emitted arm TYPES can be read, and the value never leaves
 *  this function's call. Do not "fix" it into a descriptor default. */
function spendProbeValue(descriptor: RulePresetKnobDescriptor): RulePresetKnobValue {
  switch (descriptor.kind) {
    case "number":
    case "text":
    case "textList":
    case "choice":
      return descriptor.default;
    case "entityRef":
      return "";
    default: {
      const exhaustive: never = descriptor;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Does this preset MINT A RECURRING CHARGE at its default knobs? DERIVED — the def's own builder is run and
 *  its emitted arms are tested against the contract's `SPEND_ARM_TYPES`, so the picker's spend signal cannot
 *  drift from what the mint actually creates. A hand-maintained `spends` flag on the def would be a boolean
 *  an author forgets to flip, on a money surface (#655).
 *
 *  WHY THIS ONE RUNS THE BUILDER WHILE `ruleCount` STAYS DATA — the ruling survives, its input changed. That
 *  field is DATA precisely so the picker can say "(1/2)" before a build, and it can be: a preset's rule COUNT
 *  is knob-independent. Spend is not. `clockFires` emits a `trigger_turn` under `firedArm: "narrate"` and a
 *  free `post_notification` under `"notify"`, so no static fact about the def answers the question — only the
 *  builder does. The DEFAULT bag is the honest input because it is the configuration a host mints by pressing
 *  Add without touching a knob, which is exactly the row the catalogue is labelling. */
export function rulePresetSpendsAtDefaults(def: ErasedRulePresetDef): boolean {
  const probe: Record<string, RulePresetKnobValue> = {};
  for (const [key, descriptor] of Object.entries(def.knobs)) {
    probe[key] = spendProbeValue(descriptor);
  }
  const spendArms: readonly string[] = SPEND_ARM_TYPES;
  return def.rules(probe).some((rule) => rule.arms.some((arm) => spendArms.includes(arm.type)));
}

/** Project a def onto the picker's read model — the knob schema flattened to a keyed list. Carries no CEL
 *  and no arm templates (those are server logic; the client picks an id + knob values). */
export function toRulePresetView(def: ErasedRulePresetDef): RulePresetView {
  const knobs: RulePresetKnobView[] = Object.entries(def.knobs).map(([key, descriptor]) => ({ ...descriptor, key }));
  return {
    id: def.id,
    scope: def.scope,
    title: def.title,
    summary: def.summary,
    ruleCount: def.ruleCount,
    confirmFirst: def.confirmFirst,
    spends: rulePresetSpendsAtDefaults(def),
    knobs,
  };
}
