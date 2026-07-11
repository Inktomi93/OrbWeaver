// domain/connection/catalog/resolve-model-capability — the ONE capability descriptor factory.
// Replaces neo-tavern's `ChatModel` + `FAMILY_CAPS` duality + the three
// `derive*Profile` functions (OR / vLLM / custom-openai). Produces a `ModelCapability` per resolved
// `(model, source)`:
//   • CURATED  — a Claude-shortlist id (getChatModel's 3-stage match): return the curated descriptor
//                verbatim. This runs FIRST so a Claude-via-OR version-only id gets the dated curated
//                profile, never synthesis (the getChatModel 3-stage match — chat-models.ts header).
//   • openrouter — SYNTHESIZE from the catalog entry's `supportedParameters` + the family (the dissolved
//                FAMILY_CAPS reasoning facts); a cold/missing entry yields the permissive baseline.
//   • vllm / local-light — STATIC profiles (the local engine tiers; window is engine-served).
//   • custom_openai — USER-DECLARED (DEFERRED) → a conservative baseline until the BYO modelProfile lands.
//
// `infra/providers` NEVER imports this — the funnel reads the `ModelCapability` handed in on the request
// (infra→domain is illegal upward). Reasoning/sampling/verbosity/output/context are DISTINCT axes; nothing
// here collapses them into a cascade, and `effortLevels` never carries a `'none'` member.

import type {
  AgentSdkModel,
  ChatApi,
  ChatSource,
  ModelCapability,
  Range,
} from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { getChatModel } from "./chat-models";
import type { MODEL_FAMILIES } from "./model-family";
import { detectModelFamily } from "./model-family";
import { resolveAgentSdkAlias } from "./resolve-agent-sdk-alias";
import {
  NON_CACHING_TURNS,
  refineAnthDirectSampling,
  refineCuratedTurns,
  synthesizeAnthropicTurns,
} from "./turns";
import type { WIRE_SHAPES } from "./wire-shape";
import { deriveWireShape } from "./wire-shape";

/** The resolver-internal wire-shape key (re-derived from the tuple; no-inline-types keeps it file-local). */
type WireShape = (typeof WIRE_SHAPES)[number];

// ── Named bounds (noMagicNumbers). DEFER(promotion): the exact synthesized ranges are the "quality →
//    axes mapping" deferred item (proposed/connection-capability-panel.md) — the SHAPE (per-knob ranges, distinct
//    axes) is settled; the numbers are tuned when the shortlist is verified live. ──────────────────────
const TEMP_RANGE: Range = { min: 0, max: 2 };
const TOP_P_RANGE: Range = { min: 0, max: 1 };
const TOP_K_RANGE: Range = { min: 0, max: 200 };
const PENALTY_RANGE: Range = { min: -2, max: 2 };
const REPETITION_RANGE: Range = { min: 0, max: 2 };
const MIN_P_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_BUDGET_RANGE: Range = { min: 1024, max: 32_000 };

const MIN_OUTPUT = 1;
const OUTPUT_CAP = 32_768; // a sane upper output bound; the panel clamps the max-tokens slider to it
const OR_DEFAULT_WINDOW = 200_000; // when the catalog entry omits contextLength (cold cache)
const VLLM_GEN_CONTEXT_WINDOW = 32_768; // the engine serve-time window (neo VLLM_GEN_CONTEXT_WINDOW)
const CUSTOM_OPENAI_DEFAULT_WINDOW = 128_000; // conservative until the user declares the BYO profile
const LOCAL_LIGHT_WINDOW = 8192; // in-process embed/rerank tier — chat capability is moot here

/** The dissolved FAMILY_CAPS reasoning facts (the precursor that merged into this factory). Keyed by the
 *  one `MODEL_FAMILIES` tuple so a new family is a `tsc` error here. `effort`/`budget`/`display` map to the
 *  distinct `ModelCapability.reasoning` axes below — `hasFastMode` is GONE (dead, zero consumers). */
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

/** The reasoning axes synthesized for a non-curated OpenRouter model from its family. effort wins over
 *  budget for `mode` (anthropic-via-OR lists both); `enabled` is its OWN axis, never `effort:'none'`. */
function synthesizeReasoning(family: Family): ModelCapability["reasoning"] {
  const caps = FAMILY_REASONING[family];
  const displayModes = caps.display ? (["summarized", "omitted"] as const) : undefined;
  if (caps.effort) {
    const effortLevels =
      family === "anthropic"
        ? (["low", "medium", "high", "xhigh", "max"] as const)
        : (["minimal", "low", "medium", "high", "xhigh"] as const);
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

/** Per-knob sampling synthesized from the catalog entry's `supportedParameters`. A cold/empty set (no
 *  catalog) yields the permissive baseline (temperature + top_p) — neo's "empty ⇒ honorsTemperature=true"
 *  generalized to the descriptor. A knob the model doesn't list is simply absent (no silent no-op). */
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

/** The OpenRouter synthesis arm — supportedParameters + family → the descriptor. `contextLength` /
 *  `supportedParameters` come from the catalog entry connection holds (no provider internals). The `turns`
 *  cell is family-gated (D66, ruling 3): anthropic ⇒ `explicitPromptCache:true` + per-version cacheMinTokens
 *  (matches today's Anthropic-family cache emit); every other family ⇒ NON_CACHING_TURNS. */
function synthesizeOpenRouter(
  model: string,
  wireShape: WireShape,
  entry: { contextLength: number | null; supportedParameters: readonly string[] } | undefined,
): ModelCapability {
  const family = detectModelFamily(model);
  const supported = new Set(entry?.supportedParameters ?? []);
  const window = entry?.contextLength ?? OR_DEFAULT_WINDOW;
  // The OR openai-compat synthesis (temperature/top_p/…). On the anthropic-direct shape it is refined to the
  // fail-closed per-model seed (D68-C): a synthesized anthropic Claude on the DIRECT wire honors no sampling
  // knob until the probe opens its entry, so the runner never sends a value the Messages wire would 400.
  const sampling = refineAnthDirectSampling(model, wireShape, synthesizeSampling(supported));
  const verbosity =
    family === "openai" && supported.has("verbosity")
      ? (["low", "medium", "high"] as const)
      : undefined;
  return {
    reasoning: synthesizeReasoning(family),
    sampling,
    ...(verbosity ? { verbosity: [...verbosity] } : {}),
    output: { maxTokens: { min: MIN_OUTPUT, max: Math.min(window, OUTPUT_CAP) } },
    context: { window },
    turns:
      family === "anthropic"
        ? synthesizeAnthropicTurns(model, wireShape)
        : { ...NON_CACHING_TURNS },
  };
}

/** A static no-reasoning profile for the local engine tiers / conservative BYO fallback. `sampling` is the
 *  full OpenAI-compatible knob set for vLLM; `{}` (none) for the chat-less local-light tier. */
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
    // Static arms (vllm / local-light / custom-openai / cold max-pro-sub) never explicit-cache-place today
    // — the non-caching floor is behavior-neutral (a curated Claude never reaches here; §4b static column).
    turns: { ...NON_CACHING_TURNS },
  };
}

/** Attach the shape-refined curated `turns` cell + the direct-transport `sampling` seed to a curated
 *  descriptor. `turns` is refined per wire-shape (part 01 §3.3); `sampling` is refined ONLY on the
 *  `anthropic-direct` shape (D68-C / part 03 §3 — the direct wire is the one place a curated Claude honors
 *  any sampling knob, seeded fail-closed `{}` until the W9 probe opens an entry). Every OTHER axis
 *  (reasoning/output/context) is shape-invariant, so the curated-first short-circuit stays correct for them
 *  and the cli/openai curated sampling stays the curated `{}`. */
function withCuratedTurns(
  curated: { readonly capability: ModelCapability },
  id: ModelId | string,
  wireShape: WireShape,
): ModelCapability {
  return {
    ...curated.capability,
    sampling: refineAnthDirectSampling(id, wireShape, curated.capability.sampling),
    turns: refineCuratedTurns(id, wireShape),
  };
}

/**
 * Resolve the ONE capability descriptor for a `(model, source)` on the `api`-implied WIRE-SHAPE. The
 * curated lookup runs FIRST (so a Claude id — bare OR version-only via OR — gets its curated profile, not
 * synthesis); otherwise dispatch on the source (exhaustive — a new source is a `tsc` error here). `orEntry`
 * is the OpenRouter catalog entry connection holds in its snapshot/cache, threaded in by the caller (no
 * provider internals).
 *
 * THE FINDING-1 FIX (part 01 §3): `api` threads in so `deriveWireShape(api, source)` produces the wire-shape
 * the per-shape `turns` cell keys on — the curated-first short-circuit now refines `turns` per shape while
 * every other axis stays shape-invariant.
 */
export function resolveModelCapability(
  model: ModelId | string,
  source: ChatSource,
  api: ChatApi,
  caches?: {
    readonly orEntry?:
      | { contextLength: number | null; supportedParameters: readonly string[] }
      | undefined;
    readonly agentSdkModels?: readonly AgentSdkModel[] | null | undefined;
  },
): ModelCapability {
  const wireShape = deriveWireShape(api, source);
  const curated = getChatModel(model);
  if (curated !== undefined) {
    return withCuratedTurns(curated, model, wireShape);
  }
  switch (source) {
    case "max-pro-sub": {
      // The family→version fix: a bare family alias (`sonnet`/`opus`/`haiku`) or a stale/uncurated id that
      // the curated lookup above missed resolves via the DAEMON's live map (`resolveAgentSdkAlias`) to the
      // current version + its reported capability flags — DAEMON-owned, so identical for the sub + OR-skin.
      // A daemon Claude is an anthropic model on the anthropic-cli wire — attach the family turns cell.
      const daemon = resolveAgentSdkAlias(model, caches?.agentSdkModels ?? null);
      if (daemon !== undefined) {
        return { ...daemon.capability, turns: synthesizeAnthropicTurns(model, wireShape) };
      }
      // No curated match AND no daemon row (cold cache / unknown id) — a conservative no-reasoning profile
      // rather than synthesis (a max-pro-sub turn is Claude-only; synthesis would fabricate the wrong axes).
      return staticProfile(OR_DEFAULT_WINDOW, false);
    }
    case "openrouter":
      return synthesizeOpenRouter(model, wireShape, caches?.orEntry);
    case "vllm":
      return staticProfile(VLLM_GEN_CONTEXT_WINDOW, true);
    case "local-light":
      // The in-process transformers.js/ONNX embed/rerank tier — never a chat turn, so the descriptor is a
      // conservative placeholder (no reasoning, no sampling). Carried so ResolvedConnection always has one.
      return staticProfile(LOCAL_LIGHT_WINDOW, false);
    case "custom_openai":
      // FLAG[PD-12]: the BYO profile is USER-DECLARED via providerMetadataSchema.modelProfile (the
      // credential metadata, v1-deferred in @orb/contracts/credentials) or the inspector probe → home it
      // when the custom-byo settings form lands. Until then: a conservative OpenAI-compatible baseline.
      return staticProfile(CUSTOM_OPENAI_DEFAULT_WINDOW, true);
    default:
      return assertNever(source);
  }
}
