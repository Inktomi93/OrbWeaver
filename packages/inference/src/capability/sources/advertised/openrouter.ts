// The ADVERTISED tier from an OpenRouter catalog row: the catalog is the truth about modalities, window,
// output cap, moderation, the reasoning object (R0 — its `supportedEfforts` allowlist supersedes any family
// effort list) and WHICH sampling knobs exist (`supported_parameters` gives NAMES, not ranges — the ranges are
// the constants below, §8.7). Turn cells are NOT advertised: they come from the curated rows.

import type {
  EffortLevel,
  EmbeddingCapability,
  GenerationCapability,
  ModelCatalogEntry,
  ReasoningCapability,
  RerankCapability,
  SamplingCapability,
} from "@orb/contracts/inference";
import { EFFORT_LEVELS, parseModalities } from "@orb/contracts/inference";

const TEMP_RANGE = { min: 0, max: 2 };
const TOP_P_RANGE = { min: 0, max: 1 };
const TOP_K_RANGE = { min: 0, max: 200 };
const PENALTY_RANGE = { min: -2, max: 2 };
const REPETITION_RANGE = { min: 0, max: 2 };
const MIN_P_RANGE = { min: 0, max: 1 };
const TOP_A_RANGE = { min: 0, max: 1 };
const MIN_OUTPUT = 1;
const OUTPUT_CAP = 32_768;

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/** OR's allowlist in OUR order. `null`/absent (no allowlist ⇒ all gateway efforts) or an all-unknown list
 *  falls back to the full `EFFORT_LEVELS`. */
function toEffortLevels(supported: readonly string[] | null | undefined): EffortLevel[] {
  if (supported === null || supported === undefined) {
    return [...EFFORT_LEVELS];
  }
  const levels = supported.filter(isEffortLevel);
  return levels.length > 0 ? levels : [...EFFORT_LEVELS];
}

function reasoningFromOr(reasoning: NonNullable<ModelCatalogEntry["reasoning"]>): ReasoningCapability {
  const defaultEffort =
    reasoning.defaultEffort !== null && reasoning.defaultEffort !== undefined && isEffortLevel(reasoning.defaultEffort) ? reasoning.defaultEffort : undefined;
  return {
    mode: "effort",
    // CAN reason — an OR reasoning model can always reason; `defaultEnabled` is carried as truth and gates the
    // default-on fill in the funnel (keeping `enabled` = defaultEnabled would block an EXPLICIT effort).
    enabled: true,
    effortLevels: toEffortLevels(reasoning.supportedEfforts),
    ...(reasoning.mandatory ? { mandatory: true } : {}),
    ...(reasoning.defaultEnabled !== undefined ? { defaultEnabled: reasoning.defaultEnabled } : {}),
    ...(defaultEffort !== undefined ? { defaultEffort } : {}),
    ...(reasoning.supportsMaxTokens === true ? { supportsMaxTokens: true } : {}),
  };
}

/** A cold/empty `supported` set yields the permissive baseline (temperature + top_p). */
function samplingFromOr(supported: ReadonlySet<string>): SamplingCapability {
  if (supported.size === 0) {
    return { temperature: TEMP_RANGE, topP: TOP_P_RANGE };
  }
  return {
    ...(supported.has("temperature") ? { temperature: TEMP_RANGE } : {}),
    ...(supported.has("top_p") ? { topP: TOP_P_RANGE } : {}),
    ...(supported.has("top_k") ? { topK: TOP_K_RANGE } : {}),
    ...(supported.has("frequency_penalty") ? { frequencyPenalty: PENALTY_RANGE } : {}),
    ...(supported.has("presence_penalty") ? { presencePenalty: PENALTY_RANGE } : {}),
    ...(supported.has("repetition_penalty") ? { repetitionPenalty: REPETITION_RANGE } : {}),
    ...(supported.has("min_p") ? { minP: MIN_P_RANGE } : {}),
    ...(supported.has("top_a") ? { topA: TOP_A_RANGE } : {}),
    ...(supported.has("seed") ? { seed: true } : {}),
    ...(supported.has("logit_bias") ? { logitBias: true } : {}),
    ...(supported.has("stop") ? { stop: true } : {}),
  };
}

/** The REAL per-model output cap when OR advertises it; else the window-derived estimate (D68:
 *  absence-degrades, never a guessed cap). Floored at MIN_OUTPUT so a bogus 0 cannot zero the range. */
function outputCap(entry: ModelCatalogEntry): number {
  const advertisedMax = entry.maxCompletionTokens;
  if (advertisedMax !== undefined && advertisedMax !== null) {
    return Math.max(MIN_OUTPUT, advertisedMax);
  }
  return Math.min(entry.contextLength ?? OUTPUT_CAP, OUTPUT_CAP);
}

/** The advertised partial for a NON-CHAT row: the catalog states the window (the per-pair context) and the
 *  input modalities; `dims`/`mrl` are never advertised (curated `embedders.ts`, or the row's `declared`). */
function advertisedVectorFromOpenRouter(entry: ModelCatalogEntry): Partial<EmbeddingCapability> | Partial<RerankCapability> {
  const input = parseModalities(entry.inputModalities);
  return {
    ...(entry.contextLength !== null ? { maxInputTokens: entry.contextLength } : {}),
    ...(input.modalities.length > 0 ? { input: [...input.modalities] } : {}),
  };
}

/** The advertised PARTIAL, shaped by the row's KIND: only what the catalog states. The window's absence marks
 *  the fold `windowEstimated` downstream (a cold snapshot is the norm on a fresh install). */
export function advertisedFromOpenRouter(entry: ModelCatalogEntry): Partial<GenerationCapability> | Partial<EmbeddingCapability> | Partial<RerankCapability> {
  if (entry.kind === "embedding" || entry.kind === "rerank") {
    return advertisedVectorFromOpenRouter(entry);
  }
  return advertisedGenerationFromOpenRouter(entry);
}

function advertisedGenerationFromOpenRouter(entry: ModelCatalogEntry): Partial<GenerationCapability> {
  const supported = new Set(entry.supportedParameters);
  const input = parseModalities(entry.inputModalities);
  const output = parseModalities(entry.outputModalities);
  const inputModalities = input.modalities.length > 0 ? [...input.modalities] : ["text" as const];
  const outputModalities = output.modalities.length > 0 ? [...output.modalities] : ["text" as const];
  return {
    sampling: samplingFromOr(supported),
    ...(entry.reasoning !== null && entry.reasoning !== undefined ? { reasoning: reasoningFromOr(entry.reasoning) } : {}),
    ...(supported.has("verbosity") ? { verbosity: ["low", "medium", "high"] } : {}),
    input: inputModalities,
    ...(input.estimated || output.estimated ? { modalitiesEstimated: true } : {}),
    ...(supported.has("tools") ? { tools: { parallel: true } } : {}),
    output: {
      maxTokens: { min: MIN_OUTPUT, max: outputCap(entry) },
      ...(supported.has("structured_outputs") ? { structured: true } : {}),
      modalities: outputModalities,
    },
    ...(entry.contextLength !== null ? { context: { window: entry.contextLength } } : {}),
    ...(entry.isModerated === true ? { moderated: true } : {}),
    // `imageEdit` ⇐ image IN and image OUT (the model both accepts a reference image and produces one — R1).
    ...(inputModalities.includes("image") && outputModalities.includes("image") ? { imageEdit: true } : {}),
  };
}
