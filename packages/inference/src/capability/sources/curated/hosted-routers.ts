// Curated capability rows: the sampler set each hosted router's chat route documents, whatever model it routes to,
// composed FIRST so a model family's own stated set replaces it, and the advertised tier (a list that states a
// model's parameters, LiteRouter's `supported_parameters`) replaces both. Without a row here a router's turns fall to
// the floor's empty set and every sampler is dropped. Each knob is one the provider's page names; a span the page does
// not state is the slider span the other curated rows use. Both routers forward a sampler to the model they route
// to, so whether the model honours it is the upstream model's, not the router's.

import type { CapabilityOverrideInput, Range } from "@orb/contracts/inference";

const ANY_MODEL = ".*";
const DATED = "2026-11-15";

const PROBABILITY: Range = { min: 0, max: 1 };
const PENALTY: Range = { min: -2, max: 2 };
const TEMPERATURE: Range = { min: 0, max: 2 };
// NanoGPT states `top_k` as "1+" with no ceiling; 200 is the slider span the local-server rows use.
const NANOGPT_TOP_K: Range = { min: 1, max: 200 };
const NANOGPT_REPETITION: Range = { min: 0, max: 2 };
const MIROSTAT_MODE: Range = { min: 0, max: 2 };
// NanoGPT states no span for Mirostat's tau or eta; these are the local-server rows' spans.
const MIROSTAT_TAU: Range = { min: 0, max: 10 };

export const hostedRouterRows = [
  {
    match: { model: ANY_MODEL, provider: "nanogpt" },
    generation: {
      sampling: {
        temperature: TEMPERATURE,
        topP: PROBABILITY,
        topK: NANOGPT_TOP_K,
        // The page gives `top_a` no span; OpenRouter's catalog reader offers the same 0 to 1.
        topA: PROBABILITY,
        minP: PROBABILITY,
        typicalP: PROBABILITY,
        mirostatMode: MIROSTAT_MODE,
        mirostatTau: MIROSTAT_TAU,
        mirostatEta: PROBABILITY,
        frequencyPenalty: PENALTY,
        presencePenalty: PENALTY,
        repetitionPenalty: NANOGPT_REPETITION,
        banEos: true,
        seed: true,
        stop: true,
        logitBias: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "docs.nano-gpt.com api-reference/endpoint/chat-completion, Sampling & Decoding Controls: every field optional, omitted ones take the provider default; invalid ranges 400 before the provider",
    },
  },
  {
    match: { model: ANY_MODEL, provider: "literouter" },
    // The Making Requests page names one sampler; a model whose list row states its parameters takes those instead.
    generation: { sampling: { temperature: TEMPERATURE } },
    evidence: {
      tier: "curated",
      dated: DATED,
      cite: "docs.literouter.com/making-requests, Request body: temperature, 0-2, optional (default 1)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
