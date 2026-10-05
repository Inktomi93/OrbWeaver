// Curated capability rows — the sampler set each local server takes, whatever model it runs, composed LAST so
// it replaces a family row's set (`sampling` replaces). A Custom endpoint's default set composes FIRST instead:
// it may proxy a hosted family, whose own stated set must win. Body spellings live on the provider rows.

import type { CapabilityOverrideInput, Range } from "@orb/contracts/inference";

const ANY_MODEL = ".*";
const DATED = "2026-10-03";

// Shared spans. A server that clamps nothing still needs a slider span; these are the spans the clamp holds.
const PROBABILITY: Range = { min: 0, max: 1 };
const PENALTY: Range = { min: -2, max: 2 };
// A repetition penalty multiplies or divides logits: llama.cpp divides by it (src/llama-sampler.cpp), so 0 is a
// division by zero, and vLLM refuses it (`> 0`). Every server's span starts just above.
const REPETITION: Range = { min: 0.01, max: 2 };
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
// Adaptive-P's EMA decay: llama.cpp hard-limits 0..0.99, KoboldCpp clamps to 0.01..0.99.
const LLAMA_ADAPTIVE_DECAY: Range = { min: 0, max: 0.99 };
const KOBOLD_ADAPTIVE_DECAY: Range = { min: 0.01, max: 0.99 };
const MIN_KEEP: Range = { min: 0, max: 100 };
// vLLM refuses `top_p` 0 (`(0, 1]`), so its span starts just above.
const VLLM_TOP_P: Range = { min: 0.01, max: 1 };

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
  adaptiveTarget: PROBABILITY,
  bannedStrings: true,
  banEos: true,
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
  repetitionPenalty: REPETITION,
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
        adaptiveDecay: LLAMA_ADAPTIVE_DECAY,
        minKeep: MIN_KEEP,
        // The server's default chain (common/common.h `samplers`), then `adaptive_p`: it replaces the final
        // draw only while `adaptive_target` is set (sampling.cpp, llama-sampler.cpp), so listing it is inert.
        samplerOrder: ["penalties", "dry", "topNSigma", "topK", "typicalP", "topP", "minP", "xtc", "temperature", "adaptiveP"],
        // Mirostat 1 or 2 builds a chain of plain temperature and Mirostat alone (common/sampling.cpp).
        mirostatSkips: [
          "topP",
          "topK",
          "minP",
          "typicalP",
          "topNSigma",
          "repetitionPenalty",
          "repetitionPenaltyRange",
          "presencePenalty",
          "frequencyPenalty",
          "xtcProbability",
          "xtcThreshold",
          "dryMultiplier",
          "dryBase",
          "dryAllowedLength",
          "dryPenaltyLastN",
          "drySequenceBreakers",
          "dynatempRange",
          "dynatempExponent",
          "adaptiveTarget",
          "adaptiveDecay",
          "minKeep",
        ],
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
        adaptiveDecay: KOBOLD_ADAPTIVE_DECAY,
        // The default `sampler_order` [6, 0, 1, 3, 4, 2, 5] without tail-free sampling (3), which no preset knob sets.
        samplerOrder: ["penalties", "topK", "topA", "typicalP", "topP", "temperature"],
        // Its Mirostat branch runs DRY, the repetition stage and temperature with smoothing, then Mirostat; the order,
        // the truncation samplers, n-sigma, XTC and Adaptive-P do not run (gpttype_adapter.cpp SampleLogits).
        mirostatSkips: [
          "topK",
          "topA",
          "topP",
          "minP",
          "typicalP",
          "topNSigma",
          "dynatempRange",
          "dynatempExponent",
          "xtcProbability",
          "xtcThreshold",
          "adaptiveTarget",
          "adaptiveDecay",
        ],
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
        repetitionPenalty: REPETITION,
        repetitionPenaltyRange: TOKEN_WINDOW,
        frequencyPenalty: PENALTY,
        presencePenalty: PENALTY,
        seed: true,
        stop: true,
      },
    },
    // `typical_p` is left out: Ollama deprecated it (api/types.go:578) and only warns while passing it on.
    evidence: { tier: "curated", dated: DATED, cite: "ollama 42e911bc api/types.go Options (568-596) decoded by Options.FromMap (1022-1123)" },
  },
  {
    // The same server with its native route turned off (`nativeChat: none`): `/v1/chat/completions` converts only
    // these into options and drops `top_k`, `min_p`, `repeat_penalty`, `repeat_last_n` and `num_ctx` unread.
    match: { model: ANY_MODEL, provider: "ollama", nativeChat: "none" },
    generation: {
      sampling: {
        temperature: LOCAL_TEMPERATURE,
        topP: PROBABILITY,
        frequencyPenalty: PENALTY,
        presencePenalty: PENALTY,
        seed: true,
        stop: true,
      },
      routeSamplingDefaults: { temperature: 1, topP: 1 },
    },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "ollama 42e911bc openai/openai.go ChatCompletionRequest (118-144) and fromChatRequest (604-816); fromChatRequest sets options temperature and top_p to 1.0 when the request omits them (ollama main openai/openai.go, read 2026-10-04)",
    },
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
    // Beyond the Custom default: `bad_words` and `ignore_eos` (chat_completion/protocol.py), spelled on its row.
    generation: { sampling: { ...VLLM_SAMPLING, bannedStrings: true, banEos: true } },
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
