// Descriptor-driven params-panel model: the panel renders from `GenerationCapability` — a sampling knob
// shows only where the descriptor lists it, ranges come from each knob's `Range`, reasoning control is
// keyed by the model's actual `reasoning` axis. Never hardcode a knob stack or model-name string-match;
// the knob vocabulary comes only from @orb/contracts.
//
// The `quality` dial (fast/balanced/deep) is a distinct user field the server-side resolver maps onto
// the descriptor axes; this client model owns only the dial's display copy.

import type { EffortLevel, GenerationCapability, Range, SamplerStage, Verbosity } from "@orb/contracts/inference";
import { DEFAULT_SAMPLER_KEYS } from "@orb/contracts/inference";
import type { Quality } from "@orb/contracts/preset";
import { QUALITY_LEVELS } from "@orb/contracts/preset";
import type { SelectItems } from "@orb/ui/select/items";

type Sampling = GenerationCapability["sampling"];
type NumericSamplingKey = {
  [K in keyof Sampling]-?: NonNullable<Sampling[K]> extends Range ? K : never;
}[keyof Sampling];

const SPECIAL_KNOB_PARAM_PATHS = ["params.maxOutputTokens", "params.maxContextTokens", "params.thinkingBudgetTokens"] as const;
type KnobParamPath = `params.${NumericSamplingKey}` | (typeof SPECIAL_KNOB_PARAM_PATHS)[number];

/** Numeric field paths shared by sampling and specialized integer controls. */
export interface KnobBinding {
  readonly field: KnobParamPath;
}

interface SamplingKnobSpec {
  readonly key: NumericSamplingKey;
  readonly field: `params.${NumericSamplingKey}`;
  readonly label: string;
  readonly readoutLabel: string;
  readonly wire: string;
  readonly description: string;
  readonly step: number;
}

type SamplingKnobCatalog = {
  readonly [K in NumericSamplingKey]: SamplingKnobSpec & { readonly key: K; readonly field: `params.${K}` };
};

// Object insertion order preserves the editor's sampling order.
const SAMPLING_KNOB_CATALOG = {
  temperature: {
    key: "temperature",
    readoutLabel: "temperature",
    wire: DEFAULT_SAMPLER_KEYS.temperature,
    field: "params.temperature",
    label: "Temperature",
    description: "Higher is more random/creative; lower is more focused/deterministic.",
    step: 0.01,
  },
  topP: {
    key: "topP",
    readoutLabel: "top-p",
    wire: DEFAULT_SAMPLER_KEYS.topP,
    field: "params.topP",
    label: "Top-P",
    description: "Nucleus sampling — the cumulative-probability cutoff for candidate tokens.",
    step: 0.01,
  },
  topK: {
    key: "topK",
    readoutLabel: "top-k",
    wire: DEFAULT_SAMPLER_KEYS.topK,
    field: "params.topK",
    label: "Top-K",
    description: "Keep only the K most-likely tokens each step (0 = unlimited).",
    step: 1,
  },
  minP: {
    key: "minP",
    readoutLabel: "min-p",
    wire: DEFAULT_SAMPLER_KEYS.minP,
    field: "params.minP",
    label: "Min-P",
    description: "Drop tokens below this fraction of the top token's probability (RP-critical).",
    step: 0.01,
  },
  topA: {
    key: "topA",
    readoutLabel: "top-a",
    wire: DEFAULT_SAMPLER_KEYS.topA,
    field: "params.topA",
    label: "Top-A",
    description: "Drop tokens whose probability falls below `topA × (top token)²` — an adaptive tail cut.",
    step: 0.01,
  },
  frequencyPenalty: {
    key: "frequencyPenalty",
    readoutLabel: "freq. penalty",
    wire: DEFAULT_SAMPLER_KEYS.frequencyPenalty,
    field: "params.frequencyPenalty",
    label: "Frequency penalty",
    description: "Discourage repeating tokens in proportion to how often they've appeared.",
    step: 0.01,
  },
  presencePenalty: {
    key: "presencePenalty",
    readoutLabel: "presence penalty",
    wire: DEFAULT_SAMPLER_KEYS.presencePenalty,
    field: "params.presencePenalty",
    label: "Presence penalty",
    description: "Discourage reusing any token that has already appeared at all.",
    step: 0.01,
  },
  repetitionPenalty: {
    key: "repetitionPenalty",
    readoutLabel: "rep. penalty",
    wire: DEFAULT_SAMPLER_KEYS.repetitionPenalty,
    field: "params.repetitionPenalty",
    label: "Repetition penalty",
    description: "A multiplicative penalty on repeated tokens (1 = off).",
    step: 0.01,
  },
  repetitionPenaltyRange: {
    key: "repetitionPenaltyRange",
    readoutLabel: "rep. range",
    wire: DEFAULT_SAMPLER_KEYS.repetitionPenaltyRange,
    field: "params.repetitionPenaltyRange",
    label: "Repetition range",
    description: "How many recent tokens the repetition penalty looks back over (0 = off).",
    step: 1,
  },
  typicalP: {
    key: "typicalP",
    readoutLabel: "typical-p",
    wire: DEFAULT_SAMPLER_KEYS.typicalP,
    field: "params.typicalP",
    label: "Typical-P",
    description: "Keep the tokens whose surprise is close to the expected surprise (1 = off).",
    step: 0.01,
  },
  topNSigma: {
    key: "topNSigma",
    readoutLabel: "top-nσ",
    wire: DEFAULT_SAMPLER_KEYS.topNSigma,
    field: "params.topNSigma",
    label: "Top-nσ",
    description: "Keep the tokens within n standard deviations of the top token's logit (0 = off).",
    step: 0.01,
  },
  xtcProbability: {
    key: "xtcProbability",
    readoutLabel: "xtc chance",
    wire: DEFAULT_SAMPLER_KEYS.xtcProbability,
    field: "params.xtcProbability",
    label: "XTC chance",
    description: "How often XTC removes the most likely tokens above its threshold, for less predictable prose (0 = off).",
    step: 0.01,
  },
  xtcThreshold: {
    key: "xtcThreshold",
    readoutLabel: "xtc threshold",
    wire: DEFAULT_SAMPLER_KEYS.xtcThreshold,
    field: "params.xtcThreshold",
    label: "XTC threshold",
    description: "Tokens above this probability are the ones XTC may remove (above 0.5 turns XTC off).",
    step: 0.01,
  },
  dryMultiplier: {
    key: "dryMultiplier",
    readoutLabel: "dry strength",
    wire: DEFAULT_SAMPLER_KEYS.dryMultiplier,
    field: "params.dryMultiplier",
    label: "DRY strength",
    description: "How hard DRY penalizes a token that would repeat an earlier sequence (0 = off).",
    step: 0.01,
  },
  dryBase: {
    key: "dryBase",
    readoutLabel: "dry base",
    wire: DEFAULT_SAMPLER_KEYS.dryBase,
    field: "params.dryBase",
    label: "DRY base",
    description: "How fast the DRY penalty grows with the length of the repeat.",
    step: 0.01,
  },
  dryAllowedLength: {
    key: "dryAllowedLength",
    readoutLabel: "dry allowed",
    wire: DEFAULT_SAMPLER_KEYS.dryAllowedLength,
    field: "params.dryAllowedLength",
    label: "DRY allowed length",
    description: "Repeats up to this many tokens long go unpenalized.",
    step: 1,
  },
  dryPenaltyLastN: {
    key: "dryPenaltyLastN",
    readoutLabel: "dry range",
    wire: DEFAULT_SAMPLER_KEYS.dryPenaltyLastN,
    field: "params.dryPenaltyLastN",
    label: "DRY range",
    description: "How many recent tokens DRY scans for repeats (0 = off).",
    step: 1,
  },
  mirostatMode: {
    key: "mirostatMode",
    readoutLabel: "mirostat",
    wire: DEFAULT_SAMPLER_KEYS.mirostatMode,
    field: "params.mirostatMode",
    label: "Mirostat",
    description: "0 = off, 1 = Mirostat, 2 = Mirostat 2.0. While on, it replaces the truncation samplers.",
    step: 1,
  },
  mirostatTau: {
    key: "mirostatTau",
    readoutLabel: "mirostat τ",
    wire: DEFAULT_SAMPLER_KEYS.mirostatTau,
    field: "params.mirostatTau",
    label: "Mirostat tau",
    description: "The surprise Mirostat aims for; lower is more focused.",
    step: 0.01,
  },
  mirostatEta: {
    key: "mirostatEta",
    readoutLabel: "mirostat η",
    wire: DEFAULT_SAMPLER_KEYS.mirostatEta,
    field: "params.mirostatEta",
    label: "Mirostat eta",
    description: "How fast Mirostat adjusts toward its target.",
    step: 0.01,
  },
  dynatempRange: {
    key: "dynatempRange",
    readoutLabel: "dyn. temp range",
    wire: DEFAULT_SAMPLER_KEYS.dynatempRange,
    field: "params.dynatempRange",
    label: "Dynamic temperature range",
    description: "Temperature moves up to this far either side of the base, following how uncertain the model is (0 = off).",
    step: 0.01,
  },
  dynatempExponent: {
    key: "dynatempExponent",
    readoutLabel: "dyn. temp exponent",
    wire: DEFAULT_SAMPLER_KEYS.dynatempExponent,
    field: "params.dynatempExponent",
    label: "Dynamic temperature exponent",
    description: "How the model's uncertainty maps onto the dynamic temperature.",
    step: 0.01,
  },
  smoothingFactor: {
    key: "smoothingFactor",
    readoutLabel: "smoothing",
    wire: DEFAULT_SAMPLER_KEYS.smoothingFactor,
    field: "params.smoothingFactor",
    label: "Smoothing factor",
    description: "Quadratic smoothing of the token probabilities (0 = off).",
    step: 0.01,
  },
  smoothingCurve: {
    key: "smoothingCurve",
    readoutLabel: "smoothing curve",
    wire: DEFAULT_SAMPLER_KEYS.smoothingCurve,
    field: "params.smoothingCurve",
    label: "Smoothing curve",
    description: "The shape of the smoothing curve (1 = plain quadratic).",
    step: 0.01,
  },
} satisfies SamplingKnobCatalog;

/** Shared sampling metadata for controls, effective readouts and typed stale-value clearing. */
export const SAMPLING_KNOBS: readonly SamplingKnobSpec[] = Object.values(SAMPLING_KNOB_CATALOG);

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
  for (const spec of SAMPLING_KNOBS) {
    const range = sampling[spec.key];
    if (range !== undefined) {
      knobs.push({ ...spec, range });
    }
  }
  return knobs;
}

/** `true` when the descriptor supports a raw integer `seed` (a distinct control from the sliders above). */
export function supportsSeed(capability: GenerationCapability): boolean {
  return capability.sampling.seed === true;
}

/** `true` when the target takes a DRY sequence-breaker list. */
export function supportsDrySequenceBreakers(capability: GenerationCapability): boolean {
  return capability.sampling.drySequenceBreakers === true;
}

/** The stages the target server can order, in its default order; `undefined` when it takes no order (D295). */
export function samplerStagesFor(capability: GenerationCapability): readonly SamplerStage[] | undefined {
  return capability.sampling.samplerOrder;
}

/** A stage's name in the order list — a knob stage reuses the knob's own label. */
export const SAMPLER_STAGE_LABELS: Readonly<Record<SamplerStage, string>> = {
  penalties: "Repetition penalties",
  dry: "DRY",
  topNSigma: SAMPLING_KNOB_CATALOG.topNSigma.label,
  topK: SAMPLING_KNOB_CATALOG.topK.label,
  topA: SAMPLING_KNOB_CATALOG.topA.label,
  typicalP: SAMPLING_KNOB_CATALOG.typicalP.label,
  topP: SAMPLING_KNOB_CATALOG.topP.label,
  minP: SAMPLING_KNOB_CATALOG.minP.label,
  xtc: "XTC",
  temperature: SAMPLING_KNOB_CATALOG.temperature.label,
};

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
