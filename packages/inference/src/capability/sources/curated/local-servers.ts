// Curated capability rows — the sampler set each local server takes, whatever model it runs, composed LAST so
// it replaces a family row's set (`sampling` replaces). A Custom endpoint's default set composes FIRST instead:
// it may proxy a hosted family, whose own stated set must win. Body spellings live on the provider rows.

import type { CapabilityOverrideInput, Range } from "@orb/contracts/inference";

const ANY_MODEL = ".*";
const DATED = "2026-10-03";

// Shared spans. A server that clamps nothing still needs a slider span; these are the spans the clamp holds.
const PROBABILITY: Range = { min: 0, max: 1 };
const PENALTY: Range = { min: -2, max: 2 };
const REPETITION: Range = { min: 0, max: 2 };
const LOCAL_TEMPERATURE: Range = { min: 0, max: 5 };
const OPENAI_TEMPERATURE: Range = { min: 0, max: 2 };
const TOP_K: Range = { min: 0, max: 200 };
const TOKEN_WINDOW: Range = { min: 0, max: 8192 };
const TOP_N_SIGMA: Range = { min: 0, max: 5 };
const DRY_MULTIPLIER: Range = { min: 0, max: 5 };
const DRY_BASE: Range = { min: 1, max: 4 };
const DRY_ALLOWED_LENGTH: Range = { min: 0, max: 20 };
const MIROSTAT_MODE: Range = { min: 0, max: 2 };
const MIROSTAT_TAU: Range = { min: 0, max: 10 };
const DYNATEMP_RANGE: Range = { min: 0, max: 5 };
const DYNATEMP_EXPONENT: Range = { min: 0, max: 10 };
const SMOOTHING_FACTOR: Range = { min: 0, max: 10 };
const SMOOTHING_CURVE: Range = { min: 1, max: 10 };
// vLLM refuses `top_p` 0 and a repetition penalty of 0 (`(0, 1]`, `> 0`), so its spans start just above.
const VLLM_TOP_P: Range = { min: 0.01, max: 1 };
const VLLM_REPETITION: Range = { min: 0.01, max: 2 };

/** The DRY, XTC, Mirostat and dynamic-temperature samplers both llama.cpp and KoboldCpp take. */
const SHARED_LOCAL_SAMPLERS = {
  temperature: LOCAL_TEMPERATURE,
  topP: PROBABILITY,
  topK: TOP_K,
  minP: PROBABILITY,
  typicalP: PROBABILITY,
  topNSigma: TOP_N_SIGMA,
  repetitionPenalty: REPETITION,
  repetitionPenaltyRange: TOKEN_WINDOW,
  presencePenalty: PENALTY,
  xtcProbability: PROBABILITY,
  xtcThreshold: PROBABILITY,
  dryMultiplier: DRY_MULTIPLIER,
  dryBase: DRY_BASE,
  dryAllowedLength: DRY_ALLOWED_LENGTH,
  dryPenaltyLastN: TOKEN_WINDOW,
  drySequenceBreakers: true,
  mirostatMode: MIROSTAT_MODE,
  mirostatTau: MIROSTAT_TAU,
  mirostatEta: PROBABILITY,
  dynatempRange: DYNATEMP_RANGE,
  dynatempExponent: DYNATEMP_EXPONENT,
  seed: true,
  stop: true,
  logitBias: true,
} as const;

/** vLLM's chat request: the OpenAI set plus its documented extras (`top_k`, `min_p`, `repetition_penalty`). */
const VLLM_SAMPLING = {
  temperature: OPENAI_TEMPERATURE,
  topP: VLLM_TOP_P,
  topK: TOP_K,
  minP: PROBABILITY,
  repetitionPenalty: VLLM_REPETITION,
  frequencyPenalty: PENALTY,
  presencePenalty: PENALTY,
  seed: true,
  stop: true,
  logitBias: true,
} as const;

export const localServerRows = [
  {
    match: { model: ANY_MODEL, provider: "llama-cpp" },
    generation: {
      sampling: {
        ...SHARED_LOCAL_SAMPLERS,
        frequencyPenalty: PENALTY,
        // The server's default chain (common/common.h `samplers`).
        samplerOrder: ["penalties", "dry", "topNSigma", "topK", "typicalP", "topP", "minP", "xtc", "temperature"],
      },
    },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "llama.cpp a55e952b tools/server/server-schema.cpp make_llama_cmpl_schema (89-176, 434-503); the OAI chat route copies every remaining body key through (server-common.cpp:1443-1448); no top_a / smoothing field",
    },
  },
  {
    match: { model: ANY_MODEL, provider: "koboldcpp" },
    // No frequency penalty: the OpenAI route reads `frequency_penalty` only as a stand-in for an absent
    // presence penalty (koboldcpp.py:4680), so a stated range would put the value on the wrong knob.
    generation: {
      sampling: {
        ...SHARED_LOCAL_SAMPLERS,
        topA: PROBABILITY,
        smoothingFactor: SMOOTHING_FACTOR,
        smoothingCurve: SMOOTHING_CURVE,
        // The default `sampler_order` [6, 0, 1, 3, 4, 2, 5] without tail-free sampling (3), which no preset knob sets.
        samplerOrder: ["penalties", "topK", "topA", "typicalP", "topP", "temperature"],
      },
    },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "koboldcpp f9a32456 koboldcpp.py generate() (2226-2289) reads each key by name off the raw body; transform_genparams (4650-4690) aliases repetition penalties, maps stop/seed, takes mirostat only as mirostat_mode",
    },
  },
  {
    // The native `/api/chat` route (D296): its `options` map takes these and logs and ignores any other key; it
    // has no logit bias, Mirostat, DRY or XTC field.
    match: { model: ANY_MODEL, provider: "ollama" },
    generation: {
      sampling: {
        temperature: LOCAL_TEMPERATURE,
        topP: PROBABILITY,
        topK: TOP_K,
        minP: PROBABILITY,
        typicalP: PROBABILITY,
        repetitionPenalty: REPETITION,
        repetitionPenaltyRange: TOKEN_WINDOW,
        frequencyPenalty: PENALTY,
        presencePenalty: PENALTY,
        seed: true,
        stop: true,
      },
    },
    evidence: { tier: "curated", dated: DATED, cite: "ollama 42e911bc api/types.go Options (568-596) decoded by Options.FromMap (1022-1123)" },
  },
  {
    match: { model: ANY_MODEL, provider: "lm-studio" },
    generation: {
      sampling: {
        temperature: OPENAI_TEMPERATURE,
        topP: PROBABILITY,
        topK: TOP_K,
        repetitionPenalty: REPETITION,
        frequencyPenalty: PENALTY,
        presencePenalty: PENALTY,
        seed: true,
        stop: true,
        logitBias: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "lmstudio.ai/docs/developer/openai-compat/chat-completions 'Supported payload parameters' (top_p, top_k, temperature, stop, presence/frequency_penalty, logit_bias, repeat_penalty, seed)",
    },
  },
  {
    match: { model: ANY_MODEL, provider: "vllm" },
    generation: { sampling: VLLM_SAMPLING },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "vllm main entrypoints/openai/chat_completion/protocol.py ChatCompletionRequest (temperature, top_p, top_k, min_p, repetition_penalty, penalties, seed, stop, logit_bias); sampling_params.py _verify_args bounds",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];

/** The set a Custom endpoint is offered when no family row states one for its model: an unknown server gets the
 *  vLLM set, a proxied hosted model keeps its family's (D68). */
export const customEndpointRows = [
  {
    match: { model: ANY_MODEL, provider: "custom-openai" },
    generation: { sampling: VLLM_SAMPLING },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "an unknown OpenAI-compatible server is offered the vLLM set; a family row states its own, and the connection's declared sampling replaces both",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
