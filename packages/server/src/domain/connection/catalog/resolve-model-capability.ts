// The ONE capability descriptor factory for a resolved `(model, source)`: curated (Claude-shortlist) return
// verbatim; openrouter synthesizes from catalog `supportedParameters` + `inputModalities` + family;
// vllm/local-light are static; custom_openai is a conservative baseline pending BYO profile. The four
// gapped axes — `tools` / `output.structured` / `input.vision` / `input.imageEdit` — synthesize in ONE pass
// here (tool-use-design 05 §U0 + imagery-design 05 §IC-A). `infra/providers` never imports this.

import type { AgentSdkModel, ChatApi, CredentialSource, EffortLevel, ModelCapability, Range } from "@orb/contracts/connection";
import { EFFORT_LEVELS } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { env } from "#foundation/env";
import { getChatModel } from "./chat-models";
import type { MODEL_FAMILIES } from "./model-family";
import { detectModelFamily } from "./model-family";
import { resolveAgentSdkAlias } from "./resolve-agent-sdk-alias";
import { NON_CACHING_TURNS, refineCuratedTurns, synthesizeAnthropicTurns } from "./turns";
import type { WIRE_SHAPES } from "./wire-shape";
import { deriveWireShape } from "./wire-shape";

/** The resolver-internal wire-shape key (re-derived from the tuple; no-inline-types keeps it file-local). */
type WireShape = (typeof WIRE_SHAPES)[number];

/** The OpenRouter catalog slice the synthesis reads — a structural subset of `ModelCatalogEntry`, kept
 *  file-local (no-inline-types-clean, like `WireShape`) so the two call sites share one shape. */
/** OR's advertised per-model reasoning metadata (the catalog `reasoning` object) — the R0 source of truth.
 *  All five fields are captured + used: `supportedEfforts`→levels, `defaultEnabled`→`enabled`, `mandatory`
 *  + `defaultEffort` feed the funnel, `supportsMaxTokens` is captured truth. */
interface OrReasoning {
  mandatory: boolean;
  defaultEnabled?: boolean | undefined;
  supportedEfforts?: readonly string[] | null | undefined;
  defaultEffort?: string | null | undefined;
  supportsMaxTokens?: boolean | undefined;
}

interface OrEntryInput {
  contextLength: number | null;
  supportedParameters: readonly string[];
  inputModalities?: readonly string[] | undefined;
  outputModalities?: readonly string[] | undefined;
  maxCompletionTokens?: number | null | undefined;
  isModerated?: boolean | undefined;
  reasoning?: OrReasoning | null | undefined;
}

const TEMP_RANGE: Range = { min: 0, max: 2 };
const TOP_P_RANGE: Range = { min: 0, max: 1 };
const TOP_K_RANGE: Range = { min: 0, max: 200 };
const PENALTY_RANGE: Range = { min: -2, max: 2 };
const REPETITION_RANGE: Range = { min: 0, max: 2 };
const MIN_P_RANGE: Range = { min: 0, max: 1 };
const TOP_A_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_BUDGET_RANGE: Range = { min: 1024, max: 32_000 };

const MIN_OUTPUT = 1;
const OUTPUT_CAP = 32_768;
const OR_DEFAULT_WINDOW = 200_000; // when the catalog entry omits contextLength (cold cache)

const CUSTOM_OPENAI_DEFAULT_WINDOW = 128_000;
// In-process embed/rerank tier — chat capability is moot here. Sized off the embed pooling window's
// single-home env floor (VLLM_EMBED_MAX_MODEL_LEN), not a bare literal, so the 8192 lives in exactly one place.
const LOCAL_LIGHT_WINDOW = env.VLLM_EMBED_MAX_MODEL_LEN;

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

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/** Map OR's advertised effort allowlist into our `EffortLevel[]`, preserving OR's order. `null`/`undefined`
 *  (no allowlist ⇒ all gateway efforts) or an all-unknown list falls back to the full `EFFORT_LEVELS`. */
function toEffortLevels(supportedEfforts: readonly string[] | null | undefined): EffortLevel[] {
  if (supportedEfforts === null || supportedEfforts === undefined) {
    return [...EFFORT_LEVELS];
  }
  const levels = supportedEfforts.filter(isEffortLevel);
  return levels.length > 0 ? levels : [...EFFORT_LEVELS];
}

/** OR's `defaultEffort` string kept only when it maps to a real `EffortLevel` (OR may report `"none"` ⇒
 *  no default reasoning effort, dropped). */
function toEffortLevel(value: string | null | undefined): EffortLevel | undefined {
  return value !== null && value !== undefined && isEffortLevel(value) ? value : undefined;
}

/** R0 (advertised over derived): when OR advertises a per-model `reasoning` object it is the TRUTH — effort mode
 *  with the model's real allowlist. `enabled` = CAN-REASON (`true` — an OR reasoning model can always reason;
 *  keeping it `defaultEnabled` would wrongly block a user's EXPLICIT effort on an off-by-default model, since
 *  the funnel AND-gates `enabled`). `defaultEnabled` is carried as truth and gates the DEFAULT-on behavior in
 *  the funnel (the effort-default fill). `mandatory`/`defaultEffort`/`supportsMaxTokens` carried for the funnel.
 *  NOTE: the FAMILY effort curation (`FAMILY_REASONING`, the `["low"..."max"]` vs `["minimal"..."xhigh"]`
 *  per-family lists) is SUPERSEDED whenever OR advertises — deliberate: OR's `supportedEfforts` (or its
 *  "all gateway efforts" null) is the authority; the family table is the FALLBACK for no-advertisement only. */
function reasoningFromOr(family: Family, orReasoning: OrReasoning): ModelCapability["reasoning"] {
  const displayModes = FAMILY_REASONING[family].display ? (["summarized", "omitted"] as const) : undefined;
  const defaultEffort = toEffortLevel(orReasoning.defaultEffort);
  return {
    mode: "effort",
    enabled: true,
    effortLevels: toEffortLevels(orReasoning.supportedEfforts),
    ...(orReasoning.mandatory ? { mandatory: true } : {}),
    ...(orReasoning.defaultEnabled !== undefined ? { defaultEnabled: orReasoning.defaultEnabled } : {}),
    ...(defaultEffort !== undefined ? { defaultEffort } : {}),
    ...(orReasoning.supportsMaxTokens === true ? { supportsMaxTokens: true } : {}),
    ...(displayModes ? { displayModes: [...displayModes] } : {}),
  };
}

/** Falls back to the family table when OR advertises nothing (R0). */
function synthesizeReasoning(family: Family, orReasoning?: OrReasoning | null): ModelCapability["reasoning"] {
  if (orReasoning !== null && orReasoning !== undefined) {
    return reasoningFromOr(family, orReasoning);
  }
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
  if (supported.has("top_a")) {
    sampling.topA = TOP_A_RANGE;
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

/** The input-modality axes (U0 + IC-A), all derived from OR's advertised modalities — NO model-id sniff.
 *  `vision` ⇐ an `image` INPUT modality; `imageEdit` ⇐ `image` IN **and** `image` OUT (the model both
 *  accepts a reference image and produces one — R1, replaces the stale regex allow-list); `file`/`audio`/
 *  `video` ⇐ their input modalities. Capability truth only. Returns undefined when the model accepts none. */
function synthesizeInput(inputModalities: readonly string[] | undefined, outputModalities: readonly string[] | undefined): ModelCapability["input"] {
  const modalities = new Set(inputModalities ?? []);
  const vision = modalities.has("image");
  const imageEdit = vision && new Set(outputModalities ?? []).has("image");
  const file = modalities.has("file");
  const audio = modalities.has("audio");
  const video = modalities.has("video");
  if (!(vision || file || audio || video)) {
    return;
  }
  return {
    vision,
    ...(imageEdit ? { imageEdit: true } : {}),
    ...(file ? { file: true } : {}),
    ...(audio ? { audio: true } : {}),
    ...(video ? { video: true } : {}),
  };
}

/** `turns` is family-gated: anthropic ⇒ explicit-cache turns; every other family ⇒ NON_CACHING_TURNS. */
function synthesizeOpenRouter(model: string, wireShape: WireShape, entry: OrEntryInput | undefined): ModelCapability {
  const family = detectModelFamily(model);
  const supported = new Set(entry?.supportedParameters ?? []);
  // The catalog's advertised `contextLength` is the truth; its absence (a cold/never-refreshed snapshot — the
  // norm on a fresh install — or an entry that omits it) leaves only the blanket default, which is a GUESS and
  // says so (D41). Everything downstream that renders a "used / window" ratio reads that flag.
  const advertisedWindow = entry?.contextLength ?? null;
  const window = advertisedWindow ?? OR_DEFAULT_WINDOW;
  // The REAL per-model output cap when OR advertises it; else degrade to the window-derived estimate (D68:
  // absence-degrades, never a guessed cap). Floored at MIN_OUTPUT so a bogus 0 can't zero the range.
  const advertisedMax = entry?.maxCompletionTokens;
  const outputMax = advertisedMax !== undefined && advertisedMax !== null ? Math.max(MIN_OUTPUT, advertisedMax) : Math.min(window, OUTPUT_CAP);
  const sampling = synthesizeSampling(supported);
  const verbosity = family === "openai" && supported.has("verbosity") ? (["low", "medium", "high"] as const) : undefined;
  const input = synthesizeInput(entry?.inputModalities, entry?.outputModalities);
  return {
    reasoning: synthesizeReasoning(family, entry?.reasoning),
    sampling,
    ...(verbosity ? { verbosity: [...verbosity] } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(entry?.isModerated === true ? { moderated: true } : {}),
    ...(supported.has("tools") ? { tools: { parallel: true } } : {}),
    output: {
      maxTokens: { min: MIN_OUTPUT, max: outputMax },
      ...(supported.has("structured_outputs") ? { structured: true } : {}),
    },
    context: { window, ...(advertisedWindow === null ? { windowEstimated: true } : {}) },
    turns: family === "anthropic" ? synthesizeAnthropicTurns(model, wireShape) : { ...NON_CACHING_TURNS },
  };
}

/** `sampling` is the full OpenAI-compatible knob set when `fullSampling`, else `{}`. `structuredOutput`
 *  marks native constrained output (vLLM guided decoding); `tools` stays ABSENT here — the vLLM arm folds
 *  `tools: { parallel: true }` on AFTER this static resolve (its engine launches with hermes tool parsing,
 *  U0), and only that arm does; every other static arm has no tool support to claim. `windowEstimated` marks
 *  a window that is a FALLBACK GUESS (no advertised/declared/engine truth was available) — see the contract. */
function staticProfile(window: number, fullSampling: boolean, structuredOutput = false, windowEstimated = false): ModelCapability {
  const sampling: ModelCapability["sampling"] = fullSampling
    ? {
        temperature: TEMP_RANGE,
        topP: TOP_P_RANGE,
        topK: TOP_K_RANGE,
        frequencyPenalty: PENALTY_RANGE,
        presencePenalty: PENALTY_RANGE,
        repetitionPenalty: REPETITION_RANGE,
        minP: MIN_P_RANGE,
        topA: TOP_A_RANGE,
        seed: true,
        stop: true,
        // logitBias is part of the "full OpenAI-compatible knob set" this branch claims — its absence
        // made the EFF-2 resolveChat funnel DROP a BYO user's logit_bias that previously passed raw.
        logitBias: true,
      }
    : {};
  return {
    reasoning: { mode: "none", enabled: false },
    sampling,
    output: {
      maxTokens: { min: MIN_OUTPUT, max: Math.min(window, OUTPUT_CAP) },
      ...(structuredOutput ? { structured: true } : {}),
    },
    context: { window, ...(windowEstimated ? { windowEstimated: true } : {}) },
    turns: { ...NON_CACHING_TURNS },
  };
}

/** Only `turns` varies by wire-shape; sampling/reasoning/output/context stay shape-invariant. */
function withCuratedTurns(curated: { readonly capability: ModelCapability }, id: ModelId | string, wireShape: WireShape): ModelCapability {
  return {
    ...curated.capability,
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
    readonly orEntry?: OrEntryInput | undefined;
    readonly agentSdkModels?: readonly AgentSdkModel[] | null | undefined;
    /** The custom_openai credential's user-declared context window (`metadata.contextWindow`); falls back
     *  to the conservative default when unset. Only the custom_openai arm reads it. */
    readonly customContextWindow?: number | undefined;
    /** The gen engine's self-reported `max_model_len` (cached `/v1/models` truth), when available. The vllm
     *  arm PREFERS this over the env floor so a `--max-model-len` change takes effect on engine restart. */
    readonly vllmGenWindow?: number | undefined;
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
      // No curated match and no daemon row: a conservative no-reasoning profile, not synthesis. Its window is
      // the blanket default — a GUESS (nothing advertised it), so it is marked as one.
      return staticProfile(OR_DEFAULT_WINDOW, false, false, true);
    }
    case "openrouter":
      return synthesizeOpenRouter(model, wireShape, caches?.orEntry);

    case "vllm":
      // Guided decoding is native ⇒ structured output. The gen engine launches with
      // --enable-auto-tool-choice --tool-call-parser hermes (scripts/dev/vllm-engine.sh) and emits
      // parallel tool calls, so advertise the tools axis (completes U0) — the generic runRecurseLoop
      // then drives RPG/crew/buddy tool turns over the chat-completions surface.
      // TRUTH ORDER (D68 absence-degrades): the engine's self-reported window (cached `/v1/models`
      // max_model_len) WINS; else the env-owned window (which also drives the launch flag); the env schema
      // default is the last resort. No hand-copied literal here — the engine or its env launch flag owns it.
      return { ...staticProfile(caches?.vllmGenWindow ?? env.VLLM_GEN_MAX_MODEL_LEN, true, true), tools: { parallel: true } };
    case "local-light":
      return staticProfile(LOCAL_LIGHT_WINDOW, false);
    case "custom_openai": {
      // BYO profile (PD-12): the user-declared window (`metadata.contextWindow`) when set, else the
      // conservative default. No nested `CustomModelProfile` type — the flat metadata pair IS the profile.
      // An arbitrary BYO endpoint has no catalog we may call, so an UNDECLARED window is unknowable here —
      // the default is marked a guess rather than presented as this endpoint's window.
      const declared = caches?.customContextWindow;
      return staticProfile(declared ?? CUSTOM_OPENAI_DEFAULT_WINDOW, true, false, declared === undefined);
    }
    default:
      return assertNever(source);
  }
}
