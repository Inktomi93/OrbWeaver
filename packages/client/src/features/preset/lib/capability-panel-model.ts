// Descriptor-driven params-panel model: the panel renders from `ModelCapability` — a sampling knob
// shows only where the descriptor lists it, ranges come from each knob's `Range`, reasoning control is
// keyed by the model's actual `reasoning` axis. Never hardcode a knob stack or model-name string-match;
// the knob vocabulary comes only from @orb/contracts.
//
// The `quality` dial (fast/balanced/deep) is a distinct user field the server-side resolver maps onto
// the descriptor axes; this client model owns only the dial's display copy.

import type { EffortLevel, ModelCapability, Range, Verbosity } from "@orb/contracts/connection";
import type { Quality } from "@orb/contracts/preset";
import { QUALITY_LEVELS } from "@orb/contracts/preset";

// The sampling axis: each entry names the params path it binds, the label, and the capability.sampling
// key that gates it (renders only when that key carries a Range).

/** The `PromptConfig.params.*` numeric-knob paths a sampling slider may bind. */
const SAMPLING_PARAM_PATHS = [
  "params.temperature",
  "params.topP",
  "params.topK",
  "params.minP",
  "params.frequencyPenalty",
  "params.presencePenalty",
  "params.repetitionPenalty",
] as const;
type SamplingParamPath = (typeof SAMPLING_PARAM_PATHS)[number];

export interface SamplingKnobSpec {
  /** The `capability.sampling` key that gates this knob (renders only when it carries a `Range`). */
  readonly key: keyof NonNullable<ModelCapability["sampling"]>;
  /** The `params.<field>` path this knob binds (the nested TanStack Form name — a typed literal). */
  readonly field: SamplingParamPath;
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
export function samplingKnobsFor(capability: ModelCapability): readonly ResolvedSamplingKnob[] {
  const sampling = capability.sampling;
  const knobs: ResolvedSamplingKnob[] = [];
  for (const spec of SAMPLING_KNOB_SPECS) {
    const range = sampling[spec.key];
    if (range !== undefined && typeof range !== "boolean") {
      knobs.push({ ...spec, range });
    }
  }
  return knobs;
}

/** `true` when the descriptor supports a raw integer `seed` (a distinct control from the sliders above). */
export function supportsSeed(capability: ModelCapability): boolean {
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
export function reasoningControlFor(capability: ModelCapability): ReasoningControl {
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
export function verbosityLevelsFor(capability: ModelCapability): readonly Verbosity[] | undefined {
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
export interface QualityOption {
  readonly value: Quality;
  readonly label: string;
  readonly description: string;
}

/** The quality-dial options in canonical order (fast → balanced → deep). The raw descriptor knobs
 *  above live under the panel's "advanced" reveal. */
export const QUALITY_OPTIONS: readonly QualityOption[] = QUALITY_LEVELS.map((value) => ({
  value,
  label: QUALITY_META[value].label,
  description: QUALITY_META[value].description,
}));

// The quality→axes mapping lives server-side, not here — this client model owns only the dial's
// display copy; it must not re-map quality → effort (a second derivation would drift from the funnel).
