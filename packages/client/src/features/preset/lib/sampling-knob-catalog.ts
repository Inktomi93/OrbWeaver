// The sampling knobs' editor vocabulary: one spec per numeric sampler (label, field path, step),
// in the editor's order, plus the deck's names for the non-numeric sampling controls. `capability-panel-model.ts` pairs each with a capability's range.

import type { GenerationCapability, Range } from "@orb/contracts/inference";
import { PRESET_BANNED_PHRASES_LABEL, PRESET_SLOP_LIST_LABEL, PRESET_SLOP_STRENGTH_LABEL } from "./preset-names.ts";

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
    field: "params.temperature",
    label: "Temperature",
    description: "Higher is more random/creative; lower is more focused/deterministic.",
    step: 0.01,
  },
  topP: {
    key: "topP",
    field: "params.topP",
    label: "Top-P",
    description: "Nucleus sampling: the cumulative-probability cutoff for candidate tokens.",
    step: 0.01,
  },
  topK: {
    key: "topK",
    field: "params.topK",
    label: "Top-K",
    description: "Keep only the K most-likely tokens each step (0 = unlimited).",
    step: 1,
  },
  minP: {
    key: "minP",
    field: "params.minP",
    label: "Min-P",
    description: "Drop tokens below this fraction of the top token's probability (RP-critical).",
    step: 0.01,
  },
  topA: {
    key: "topA",
    field: "params.topA",
    label: "Top-A",
    description: "Drop tokens whose probability falls below `topA × (top token)²`. An adaptive tail cut.",
    step: 0.01,
  },
  frequencyPenalty: {
    key: "frequencyPenalty",
    field: "params.frequencyPenalty",
    label: "Frequency penalty",
    description: "Discourage repeating tokens in proportion to how often they've appeared.",
    step: 0.01,
  },
  presencePenalty: {
    key: "presencePenalty",
    field: "params.presencePenalty",
    label: "Presence penalty",
    description: "Discourage reusing any token that has already appeared at all.",
    step: 0.01,
  },
  repetitionPenalty: {
    key: "repetitionPenalty",
    field: "params.repetitionPenalty",
    label: "Repetition penalty",
    description: "A multiplicative penalty on repeated tokens (1 = off).",
    step: 0.01,
  },
  repetitionPenaltyRange: {
    key: "repetitionPenaltyRange",
    field: "params.repetitionPenaltyRange",
    label: "Repetition range",
    description:
      "How many recent tokens the repetition penalty looks back over. 0 turns it off on llama.cpp and Ollama; KoboldCpp reads 0 as 1 unless it batches the request.",
    step: 1,
  },
  typicalP: {
    key: "typicalP",
    field: "params.typicalP",
    label: "Typical-P",
    description: "Keep the tokens whose surprise is close to the expected surprise (1 = off).",
    step: 0.01,
  },
  topNSigma: {
    key: "topNSigma",
    field: "params.topNSigma",
    label: "Top-nσ",
    description: "Keep the tokens within n standard deviations of the top token's logit (0 = off).",
    step: 0.01,
  },
  xtcProbability: {
    key: "xtcProbability",
    field: "params.xtcProbability",
    label: "XTC chance",
    description: "How often XTC removes the most likely tokens above its threshold, for less predictable prose (0 = off).",
    step: 0.01,
  },
  xtcThreshold: {
    key: "xtcThreshold",
    field: "params.xtcThreshold",
    label: "XTC threshold",
    description: "Tokens above this probability are the ones XTC may remove (above 0.5 turns XTC off).",
    step: 0.01,
  },
  dryMultiplier: {
    key: "dryMultiplier",
    field: "params.dryMultiplier",
    label: "DRY strength",
    description: "How hard DRY penalizes a token that would repeat an earlier sequence (0 = off).",
    step: 0.01,
  },
  dryBase: {
    key: "dryBase",
    field: "params.dryBase",
    label: "DRY base",
    description: "How fast the DRY penalty grows with the length of the repeat.",
    step: 0.01,
  },
  dryAllowedLength: {
    key: "dryAllowedLength",
    field: "params.dryAllowedLength",
    label: "DRY allowed length",
    description: "Repeats up to this many tokens long go unpenalized.",
    step: 1,
  },
  dryPenaltyLastN: {
    key: "dryPenaltyLastN",
    field: "params.dryPenaltyLastN",
    label: "DRY range",
    description:
      "How many recent tokens DRY scans for repeats. 0 turns DRY off on llama.cpp but scans the whole context on KoboldCpp; set DRY strength to 0 to turn it off anywhere.",
    step: 1,
  },
  mirostatMode: {
    key: "mirostatMode",
    field: "params.mirostatMode",
    label: "Mirostat",
    description: "0 = off, 1 = Mirostat, 2 = Mirostat 2.0. While on, it replaces the truncation samplers.",
    step: 1,
  },
  mirostatTau: {
    key: "mirostatTau",
    field: "params.mirostatTau",
    label: "Mirostat tau",
    description: "The surprise Mirostat aims for; lower is more focused.",
    step: 0.01,
  },
  mirostatEta: {
    key: "mirostatEta",
    field: "params.mirostatEta",
    label: "Mirostat eta",
    description: "How fast Mirostat adjusts toward its target.",
    step: 0.01,
  },
  dynatempRange: {
    key: "dynatempRange",
    field: "params.dynatempRange",
    label: "Dynamic temperature range",
    description: "Temperature moves up to this far either side of the base, following how uncertain the model is (0 = off).",
    step: 0.01,
  },
  dynatempExponent: {
    key: "dynatempExponent",
    field: "params.dynatempExponent",
    label: "Dynamic temperature exponent",
    description: "How the model's uncertainty maps onto the dynamic temperature.",
    step: 0.01,
  },
  smoothingFactor: {
    key: "smoothingFactor",
    field: "params.smoothingFactor",
    label: "Smoothing factor",
    description: "Quadratic smoothing of the token probabilities (0 = off).",
    step: 0.01,
  },
  smoothingCurve: {
    key: "smoothingCurve",
    field: "params.smoothingCurve",
    label: "Smoothing curve",
    description: "The shape of the smoothing curve (1 = plain quadratic).",
    step: 0.01,
  },
  adaptiveTarget: {
    key: "adaptiveTarget",
    field: "params.adaptiveTarget",
    label: "Adaptive-P target",
    description: "Steers each pick toward tokens of about this probability, for varied but coherent prose (unset = off).",
    step: 0.01,
  },
  adaptiveDecay: {
    key: "adaptiveDecay",
    field: "params.adaptiveDecay",
    label: "Adaptive-P decay",
    description: "How long Adaptive-P remembers recent picks; higher looks further back.",
    step: 0.01,
  },
  minKeep: {
    key: "minKeep",
    field: "params.minKeep",
    label: "Min keep",
    description: "The fewest tokens the cutoff samplers (top-p, min-p, typical, XTC) may leave (0 = no floor).",
    step: 1,
  },
} satisfies SamplingKnobCatalog;

type FlagSamplingKey = Exclude<keyof Sampling, NumericSamplingKey | "exclusive" | "mirostatSkips">;

/** The deck's names for the sampling controls that are not a numeric track. The deck labels its controls with
 *  these and the readout reads the same words, so a knob has one name on every surface. `exclusive` and
 *  `mirostatSkips` state facts about other knobs, not controls, so they have no name. */
export const SAMPLING_FLAG_LABELS: Readonly<Record<FlagSamplingKey, string>> = {
  seed: "Seed",
  logitBias: "Word bias",
  stop: "Stop sequences",
  drySequenceBreakers: "DRY sequence breakers",
  bannedStrings: PRESET_BANNED_PHRASES_LABEL,
  banEos: "Ban end of reply",
  samplerOrder: "Sampler order",
  slopList: PRESET_SLOP_LIST_LABEL,
  slopStrength: PRESET_SLOP_STRENGTH_LABEL,
};

/** Shared sampling metadata for controls and effective readouts. */
export const SAMPLING_KNOBS: readonly SamplingKnobSpec[] = Object.values(SAMPLING_KNOB_CATALOG);
