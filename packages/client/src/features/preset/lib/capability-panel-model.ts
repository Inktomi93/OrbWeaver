// Descriptor-driven params-panel model: the panel renders from `GenerationCapability` — a sampling knob
// shows only where the descriptor lists it, ranges come from each knob's `Range`, reasoning control is
// keyed by the model's actual `reasoning` axis. Never hardcode a knob stack or model-name string-match;
// the knob vocabulary comes only from @orb/contracts.
//
// The `quality` dial (fast/balanced/deep) is a distinct user field the server-side resolver maps onto
// the descriptor axes; this client model owns only the dial's display copy.

import type { EffortLevel, GenerationCapability, Range, Verbosity } from "@orb/contracts/inference";
import type { Quality } from "@orb/contracts/preset";
import { QUALITY_LEVELS } from "@orb/contracts/preset";
import type { SelectItems } from "@orb/ui/select";

// The sampling axis: each entry names the params path it binds, the label, and the capability.sampling
// key that gates it (renders only when that key carries a Range).

/** The `PromptConfig.params.*` numeric-knob paths a `KnobRow` may bind — the sampling sliders PLUS the
 *  large-integer rows (output/context/thinking budget) that ride the same grammar at capability-fed ranges
 *  (redesign §4.1's integer arm). ONE tuple: the deck's row component and this model's specs bind from the
 *  same vocabulary, so a knob cannot be given a path no row can render. */
const KNOB_PARAM_PATHS = [
  "params.temperature",
  "params.topP",
  "params.topK",
  "params.minP",
  "params.topA",
  "params.frequencyPenalty",
  "params.presencePenalty",
  "params.repetitionPenalty",
  "params.maxOutputTokens",
  "params.maxContextTokens",
  "params.thinkingBudgetTokens",
] as const;
type KnobParamPath = (typeof KNOB_PARAM_PATHS)[number];

/** The exported carrier for {@link KnobParamPath} — a feature lib may not export a bare `type` alias
 *  (§7.4), so consumers read the path union as `KnobBinding["field"]`. */
export interface KnobBinding {
  readonly field: KnobParamPath;
}

interface SamplingKnobSpec {
  /** The `capability.sampling` key that gates this knob (renders only when it carries a `Range`). It is
   *  ALSO the `EffectiveKnob` name the effective profile keys its readings by (one spelling, both reads). */
  readonly key: keyof NonNullable<GenerationCapability["sampling"]>;
  /** The `params.<field>` path this knob binds (the nested TanStack Form name — a typed literal). */
  readonly field: KnobParamPath;
  /** The row's human label. */
  readonly label: string;
  /** A one-line explainer (the field description). */
  readonly description: string;
  /** Slider step (the knob's granularity — integers use `1`). */
  readonly step: number;
}

// The Range-bearing sampling knobs, in render order. seed/logitBias/stop are boolean support flags, not
// sliders — the panel renders them as their own controls when supported.
const SAMPLING_KNOB_SPECS: readonly SamplingKnobSpec[] = [
  {
    key: "temperature",
    field: "params.temperature",
    label: "Temperature",
    description: "Higher is more random/creative; lower is more focused/deterministic.",
    step: 0.01,
  },
  {
    key: "topP",
    field: "params.topP",
    label: "Top-P",
    description: "Nucleus sampling — the cumulative-probability cutoff for candidate tokens.",
    step: 0.01,
  },
  {
    key: "topK",
    field: "params.topK",
    label: "Top-K",
    description: "Keep only the K most-likely tokens each step (0 = unlimited).",
    step: 1,
  },
  {
    key: "minP",
    field: "params.minP",
    label: "Min-P",
    description: "Drop tokens below this fraction of the top token's probability (RP-critical).",
    step: 0.01,
  },
  {
    // G1 (redesign §10): schema-supported since the knob was minted, with no editor anywhere — the deck's
    // first honest home for it. Capability-gated like every sibling (OpenRouter advertises `top_a`).
    key: "topA",
    field: "params.topA",
    label: "Top-A",
    description: "Drop tokens whose probability falls below `topA × (top token)²` — an adaptive tail cut.",
    step: 0.01,
  },
  {
    key: "frequencyPenalty",
    field: "params.frequencyPenalty",
    label: "Frequency penalty",
    description: "Discourage repeating tokens in proportion to how often they've appeared.",
    step: 0.01,
  },
  {
    key: "presencePenalty",
    field: "params.presencePenalty",
    label: "Presence penalty",
    description: "Discourage reusing any token that has already appeared at all.",
    step: 0.01,
  },
  {
    key: "repetitionPenalty",
    field: "params.repetitionPenalty",
    label: "Repetition penalty",
    description: "A multiplicative penalty on repeated tokens (1 = off).",
    step: 0.01,
  },
];

/** One renderable sampling knob — a spec PLUS the concrete `Range` the descriptor supplied for it. */
export interface ResolvedSamplingKnob extends SamplingKnobSpec {
  readonly range: Range;
}

/**
 * The sampling knobs the panel renders for a given capability — only the specs whose descriptor key
 * carries a `Range`, each paired with that `Range`. A model with `sampling: {}` yields `[]` (no
 * sampling section); an unlisted knob is absent, never a disabled slider.
 */
export function samplingKnobsFor(capability: GenerationCapability): readonly ResolvedSamplingKnob[] {
  const sampling = capability.sampling;
  const knobs: ResolvedSamplingKnob[] = [];
  for (const spec of SAMPLING_KNOB_SPECS) {
    const range = sampling[spec.key];
    // `sampling.exclusive` is the knob-PAIR list, not a knob — never a slider.
    if (range !== undefined && typeof range !== "boolean" && !Array.isArray(range)) {
      knobs.push({ ...spec, range });
    }
  }
  return knobs;
}

/** `true` when the descriptor supports a raw integer `seed` (a distinct control from the sliders above). */
export function supportsSeed(capability: GenerationCapability): boolean {
  return capability.sampling.seed === true;
}

// The reasoning axis, keyed by reasoning.mode:
//   • 'none'     → no reasoning control at all.
//   • 'effort'   → an off-toggle + an effort dropdown of the model's actual effortLevels.
//   • 'budget'   → an off-toggle + a budget slider from budgetRange.
//   • 'adaptive' → an off-toggle + an adaptive note (the model self-budgets).

const REASONING_CONTROL_KINDS = ["none", "effort", "budget", "adaptive"] as const;
type ReasoningControlKind = (typeof REASONING_CONTROL_KINDS)[number];

/** What the reasoning section renders for a capability — the control kind + the descriptor facts it needs. */
export interface ReasoningControl {
  readonly kind: ReasoningControlKind;
  /** `false` when the model cannot reason at all — the section renders nothing. */
  readonly reasons: boolean;
  /** The model's real effort levels (only when `kind === 'effort'`); never the full enum. */
  readonly effortLevels?: readonly EffortLevel[];
  /** The token-budget range (only when `kind === 'budget'`). */
  readonly budgetRange?: Range;
}

/** Derive the reasoning control from the capability descriptor. A `mode:'none'` model renders no
 *  reasoning control at all. */
export function reasoningControlFor(capability: GenerationCapability): ReasoningControl {
  const reasoning = capability.reasoning;
  if (reasoning.mode === "none") {
    return { kind: "none", reasons: false };
  }
  if (reasoning.mode === "effort") {
    return {
      kind: "effort",
      reasons: true,
      effortLevels: reasoning.effortLevels ?? [],
    };
  }
  if (reasoning.mode === "budget") {
    return {
      kind: "budget",
      reasons: true,
      ...(reasoning.budgetRange !== undefined ? { budgetRange: reasoning.budgetRange } : {}),
    };
  }
  return { kind: "adaptive", reasons: true };
}

/** The verbosity levels the panel renders — the descriptor's own list, or `undefined` when the model does
 *  not honor verbosity (the section is then absent). */
export function verbosityLevelsFor(capability: GenerationCapability): readonly Verbosity[] | undefined {
  return capability.verbosity;
}

// ── The quality dial (the primary ergonomic control) ─────────────────────────

/** Keyed by the canonical union so a new quality level is a `tsc` error until it has copy. */
const QUALITY_META: Record<Quality, { readonly label: string; readonly description: string }> = {
  fast: { label: "Fast", description: "Snappy replies — minimal reasoning, cheaper." },
  balanced: { label: "Balanced", description: "The everyday default — reasons when it helps." },
  deep: { label: "Deep", description: "Thorough — more reasoning, higher quality, slower." },
};

/** One quality-dial option (the dial's segmented picker). */
interface QualityOption {
  readonly value: Quality;
  readonly label: string;
  readonly description: string;
}

/** The quality-dial options in canonical order (fast → balanced → deep). The raw descriptor knobs
 *  above live under the panel's "advanced" reveal.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const QUALITY_OPTIONS: readonly QualityOption[] = QUALITY_LEVELS.map((value) => ({
  value,
  label: QUALITY_META[value].label,
  description: QUALITY_META[value].description,
}));

/** The select's OFF arm (owner ruling O-18: the segmented strip dies, quality becomes a dropdown with a
 *  "don't use quality" option). A UI-ONLY sentinel: OFF is STORED AS THE ABSENCE of `params.quality`, which
 *  is already the funnel's own off arm — `resolve-chat.ts` feeds neither `QUALITY_EFFORT` nor
 *  `QUALITY_SAMPLING` when the field is undefined, and `DEFAULT_PROMPT_CONFIG.params` ships `{}`. A FOURTH
 *  `QUALITY_LEVELS` member would be the opposite of that: it would force an `"off"` row into both dial
 *  Records — a mapping that materializes defaults for "no mapping" — which is exactly what the G8 tri-state
 *  retirement ruled against (a stored third state for what an existing mechanism already expresses). So the
 *  dropdown NAMES the absence; it does not mint a value for it. */
const QUALITY_OFF = "off";

/** The dial as SELECT items — the OFF arm first, then the levels in canonical order. `SelectItems` (not
 *  `QualityOption[]`): the OFF arm is not a `Quality`, and a select renders labels, not descriptions. */
export const QUALITY_SELECT_ITEMS: SelectItems<string> = [
  { value: QUALITY_OFF, label: "Don't use quality" },
  ...QUALITY_OPTIONS.map((option) => ({ value: option.value as string, label: option.label })),
];

/** The select's value for a stored dial — the OFF sentinel when nothing is stored, never an empty string
 *  (an empty Select renders its placeholder, and "no quality" is a real, named arm here, not an unset one). */
export function qualitySelectValue(quality: Quality | undefined): string {
  return quality ?? QUALITY_OFF;
}

/** The stored dial for a select value — OFF (and any unknown string) writes the ABSENCE. */
export function qualityFromSelect(value: string | null): Quality | undefined {
  return QUALITY_LEVELS.find((level) => level === value);
}

// The quality→axes mapping lives server-side, not here — this client model owns only the dial's
// display copy; it must not re-map quality → effort (a second derivation would drift from the funnel).

// ── The large-integer arm's keyboard paging (redesign §4.1) ──────────────────────────────────────────

/** How many PageUp/PageDown steps cross a whole range — the paging feel the §4.1 integer arm specifies
 *  ("a range-sized largeStep, ~1/64th of the span"). */
const PAGE_STEPS_PER_RANGE = 64;

/** PageUp/PageDown paging for a LARGE integer range: ~1/64th of the span, rounded to a power of two and
 *  floored at 1. ONE home — output, context and the thinking budget all page the same way, and a
 *  per-cluster spelling would drift. */
export function pageStep(min: number, max: number): number {
  const span = Math.max(max - min, 1);
  return Math.max(2 ** Math.round(Math.log2(span / PAGE_STEPS_PER_RANGE)), 1);
}
