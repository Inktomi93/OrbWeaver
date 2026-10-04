// The sampling knobs' editor vocabulary: one spec per numeric sampler (label, readout label, default wire key,
// field path, step), in the editor's order. `capability-panel-model.ts` pairs each with a capability's range.

import type { GenerationCapability, Range } from "@orb/contracts/inference";
import { DEFAULT_SAMPLER_KEYS } from "@orb/contracts/inference";

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

export interface SamplingKnobSpec {
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
export const SAMPLING_KNOB_CATALOG = {
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
    description:
      "How many recent tokens the repetition penalty looks back over. 0 turns it off on llama.cpp and Ollama; KoboldCpp reads 0 as 1 unless it batches the request.",
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
    description:
      "How many recent tokens DRY scans for repeats. 0 turns DRY off on llama.cpp but scans the whole context on KoboldCpp; set DRY strength to 0 to turn it off anywhere.",
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
  adaptiveTarget: {
    key: "adaptiveTarget",
    readoutLabel: "adaptive-p target",
    wire: DEFAULT_SAMPLER_KEYS.adaptiveTarget,
    field: "params.adaptiveTarget",
    label: "Adaptive-P target",
    description: "Steers each pick toward tokens of about this probability, for varied but coherent prose (unset = off).",
    step: 0.01,
  },
  adaptiveDecay: {
    key: "adaptiveDecay",
    readoutLabel: "adaptive-p decay",
    wire: DEFAULT_SAMPLER_KEYS.adaptiveDecay,
    field: "params.adaptiveDecay",
    label: "Adaptive-P decay",
    description: "How long Adaptive-P remembers recent picks; higher looks further back.",
    step: 0.01,
  },
  minKeep: {
    key: "minKeep",
    readoutLabel: "min keep",
    wire: DEFAULT_SAMPLER_KEYS.minKeep,
    field: "params.minKeep",
    label: "Min keep",
    description: "The fewest tokens the cutoff samplers (top-p, min-p, typical, XTC) may leave (0 = no floor).",
    step: 1,
  },
} satisfies SamplingKnobCatalog;

/** Shared sampling metadata for controls, effective readouts and typed stale-value clearing. */
export const SAMPLING_KNOBS: readonly SamplingKnobSpec[] = Object.values(SAMPLING_KNOB_CATALOG);
