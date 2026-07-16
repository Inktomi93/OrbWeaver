// The ONE capability descriptor factory for a resolved `(model, source)`: curated (Claude-shortlist) return
// verbatim; openrouter synthesizes from catalog `supportedParameters` + family; vllm/local-light are static;
// custom_openai is a conservative baseline pending BYO profile. `infra/providers` never imports this.

import type { AgentSdkModel, ChatApi, CredentialSource, ModelCapability, Range } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { getChatModel } from "./chat-models";
import type { MODEL_FAMILIES } from "./model-family";
import { detectModelFamily } from "./model-family";
import { resolveAgentSdkAlias } from "./resolve-agent-sdk-alias";
import { NON_CACHING_TURNS, refineAnthDirectSampling, refineCuratedTurns, synthesizeAnthropicTurns } from "./turns";
import type { WIRE_SHAPES } from "./wire-shape";
import { deriveWireShape } from "./wire-shape";

/** The resolver-internal wire-shape key (re-derived from the tuple; no-inline-types keeps it file-local). */
type WireShape = (typeof WIRE_SHAPES)[number];

const TEMP_RANGE: Range = { min: 0, max: 2 };
const TOP_P_RANGE: Range = { min: 0, max: 1 };
const TOP_K_RANGE: Range = { min: 0, max: 200 };
const PENALTY_RANGE: Range = { min: -2, max: 2 };
const REPETITION_RANGE: Range = { min: 0, max: 2 };
const MIN_P_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_BUDGET_RANGE: Range = { min: 1024, max: 32_000 };

const MIN_OUTPUT = 1;
const OUTPUT_CAP = 32_768;
const OR_DEFAULT_WINDOW = 200_000; // when the catalog entry omits contextLength (cold cache)
const VLLM_GEN_CONTEXT_WINDOW = 32_768;
const CUSTOM_OPENAI_DEFAULT_WINDOW = 128_000;
const LOCAL_LIGHT_WINDOW = 8192; // in-process embed/rerank tier — chat capability is moot here

/** Keyed by `MODEL_FAMILIES` so a new family is a `tsc` error here. */
type Family = (typeof MODEL_FAMILIES)[number];
const FAMILY_REASONING: Record<Family, { effort: boolean; budget: boolean; display: boolean }> = {
  anthropic: { effort: true, budget: true, display: true },
  openai: { effort: true, budget: false, display: false },
  google: { effort: false, budget: true, display: false },
  meta: { effort: false, budget: false, display: false },
  deepseek: { effort: false, budget: false, display: false },
  qwen: { effort: false, budget: false, display: false },
  mistral: { effort: false, budget: false, display: false },
  xai: { effort: false, budget: false, display: false },
  other: { effort: false, budget: false, display: false },
};

function assertNever(value: never): never {
  throw new Error(`resolveModelCapability: unhandled source ${String(value)}`);
}

/** effort wins over budget for `mode` (anthropic-via-OR lists both); `enabled` is its OWN axis. */
function synthesizeReasoning(family: Family): ModelCapability["reasoning"] {
  const caps = FAMILY_REASONING[family];
  const displayModes = caps.display ? (["summarized", "omitted"] as const) : undefined;
  if (caps.effort) {
    const effortLevels =
      family === "anthropic" ? (["low", "medium", "high", "xhigh", "max"] as const) : (["minimal", "low", "medium", "high", "xhigh"] as const);
    return {
      mode: "effort",
      enabled: true,
      effortLevels: [...effortLevels],
      ...(displayModes ? { displayModes: [...displayModes] } : {}),
    };
  }
  if (caps.budget) {
    return {
      mode: "budget",
      enabled: true,
      budgetRange: ANTHROPIC_BUDGET_RANGE,
      ...(displayModes ? { displayModes: [...displayModes] } : {}),
    };
  }
  return { mode: "none", enabled: false };
}

/** A cold/empty `supported` set yields the permissive baseline (temperature + top_p). */
function synthesizeSampling(supported: ReadonlySet<string>): ModelCapability["sampling"] {
  if (supported.size === 0) {
    return { temperature: TEMP_RANGE, topP: TOP_P_RANGE };
  }
  const sampling: ModelCapability["sampling"] = {};
  if (supported.has("temperature")) {
    sampling.temperature = TEMP_RANGE;
  }
  if (supported.has("top_p")) {
    sampling.topP = TOP_P_RANGE;
  }
  if (supported.has("top_k")) {
    sampling.topK = TOP_K_RANGE;
  }
  if (supported.has("frequency_penalty")) {
    sampling.frequencyPenalty = PENALTY_RANGE;
  }
  if (supported.has("presence_penalty")) {
    sampling.presencePenalty = PENALTY_RANGE;
  }
  if (supported.has("repetition_penalty")) {
    sampling.repetitionPenalty = REPETITION_RANGE;
  }
  if (supported.has("min_p")) {
    sampling.minP = MIN_P_RANGE;
  }
  if (supported.has("seed")) {
    sampling.seed = true;
  }
  if (supported.has("logit_bias")) {
    sampling.logitBias = true;
  }
  if (supported.has("stop")) {
    sampling.stop = true;
  }
  return sampling;
}

/** `turns` is family-gated: anthropic ⇒ explicit-cache turns; every other family ⇒ NON_CACHING_TURNS. */
function synthesizeOpenRouter(
  model: string,
  wireShape: WireShape,
  entry: { contextLength: number | null; supportedParameters: readonly string[] } | undefined,
): ModelCapability {
  const family = detectModelFamily(model);
  const supported = new Set(entry?.supportedParameters ?? []);
  const window = entry?.contextLength ?? OR_DEFAULT_WINDOW;
  // On the anthropic-direct shape, sampling refines to fail-closed {} until the probe opens the model's entry.
  const sampling = refineAnthDirectSampling(model, wireShape, synthesizeSampling(supported));
  const verbosity = family === "openai" && supported.has("verbosity") ? (["low", "medium", "high"] as const) : undefined;
  return {
    reasoning: synthesizeReasoning(family),
    sampling,
    ...(verbosity ? { verbosity: [...verbosity] } : {}),
    output: { maxTokens: { min: MIN_OUTPUT, max: Math.min(window, OUTPUT_CAP) } },
    context: { window },
    turns: family === "anthropic" ? synthesizeAnthropicTurns(model, wireShape) : { ...NON_CACHING_TURNS },
  };
}

/** `sampling` is the full OpenAI-compatible knob set when `fullSampling`, else `{}`. */
function staticProfile(window: number, fullSampling: boolean): ModelCapability {
  const sampling: ModelCapability["sampling"] = fullSampling
    ? {
        temperature: TEMP_RANGE,
        topP: TOP_P_RANGE,
        topK: TOP_K_RANGE,
        frequencyPenalty: PENALTY_RANGE,
        presencePenalty: PENALTY_RANGE,
        repetitionPenalty: REPETITION_RANGE,
        minP: MIN_P_RANGE,
        seed: true,
        stop: true,
      }
    : {};
  return {
    reasoning: { mode: "none", enabled: false },
    sampling,
    output: { maxTokens: { min: MIN_OUTPUT, max: Math.min(window, OUTPUT_CAP) } },
    context: { window },
    turns: { ...NON_CACHING_TURNS },
  };
}

/** `sampling` refines only on the `anthropic-direct` shape; reasoning/output/context stay shape-invariant. */
function withCuratedTurns(curated: { readonly capability: ModelCapability }, id: ModelId | string, wireShape: WireShape): ModelCapability {
  return {
    ...curated.capability,
    sampling: refineAnthDirectSampling(id, wireShape, curated.capability.sampling),
    turns: refineCuratedTurns(id, wireShape),
  };
}

/** Resolve the ONE capability descriptor for a `(model, source)` on the `api`-implied wire-shape; the
 *  curated lookup runs first, otherwise dispatch is exhaustive on `source`. */
export function resolveModelCapability(
  model: ModelId | string,
  source: CredentialSource,
  api: ChatApi,
  caches?: {
    readonly orEntry?: { contextLength: number | null; supportedParameters: readonly string[] } | undefined;
    readonly agentSdkModels?: readonly AgentSdkModel[] | null | undefined;
    /** The custom_openai credential's user-declared context window (`metadata.contextWindow`); falls back
     *  to the conservative default when unset. Only the custom_openai arm reads it. */
    readonly customContextWindow?: number | undefined;
  },
): ModelCapability {
  const wireShape = deriveWireShape(api, source);
  const curated = getChatModel(model);
  if (curated !== undefined) {
    return withCuratedTurns(curated, model, wireShape);
  }
  switch (source) {
    case "max-pro-sub": {
      // A bare family alias or stale/uncurated id resolves via the daemon's live map to its current
      // version + reported capability flags — DAEMON-owned, so identical for the sub + OR-skin.
      const daemon = resolveAgentSdkAlias(model, caches?.agentSdkModels ?? null);
      if (daemon !== undefined) {
        return { ...daemon.capability, turns: synthesizeAnthropicTurns(model, wireShape) };
      }
      // No curated match and no daemon row: a conservative no-reasoning profile, not synthesis.
      return staticProfile(OR_DEFAULT_WINDOW, false);
    }
    case "openrouter":
      return synthesizeOpenRouter(model, wireShape, caches?.orEntry);
    case "vllm":
      return staticProfile(VLLM_GEN_CONTEXT_WINDOW, true);
    case "local-light":
      return staticProfile(LOCAL_LIGHT_WINDOW, false);
    case "custom_openai":
      // BYO profile (PD-12): the user-declared window (`metadata.contextWindow`) when set, else the
      // conservative default. No nested `CustomModelProfile` type — the flat metadata pair IS the profile.
      return staticProfile(caches?.customContextWindow ?? CUSTOM_OPENAI_DEFAULT_WINDOW, true);
    default:
      return assertNever(source);
  }
}
