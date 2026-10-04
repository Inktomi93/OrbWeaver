// `EndpointFeatures` — the CHAT body/stream quirk schema that replaces every server-named code path on the
// `openai-compat` wire (§8.1b). A provider row ships its servers' defaults, a connection overrides any field
// in `declared.features`, the transport reads the FOLDED block and never a provider id. There is no `vllm`
// dialect: vLLM is a row whose `features` say `prefill: continue-final-message`, `strictJson: default-on`,
// a sleep/wake path pair and a rerank path.
//
// SCOPE, HONESTLY: this is the chat quirk schema plus the three fan-out/deadline knobs the non-chat surfaces
// read. The non-chat surfaces' MEASURED behaviours (the ChatML wrap, the `dimensions` retry, the #165/#173
// window clamps, the `<think>` strip) stay CODE keyed off the resolved capability — a feature is a knob a
// server dials, not a behaviour a wire carries.
//
// HOMED IN CONTRACTS, NOT THE PACKAGE: `BELT_OWNED_BODY_KEYS` has a live CLIENT reader (the Extras editor
// greys the belt keys) and `@orb/inference` is node-only.

import { z } from "zod";
import type { SamplerKnob, SamplerStage } from "./capability/generation.ts";
import { SAMPLER_KNOBS } from "./capability/generation.ts";
import { WIRE_SCHEMA_MODES } from "./wire-subset.ts";

/** The request key each sampler rides under when the row names no other: the OpenAI / vLLM / llama.cpp
 *  vocabulary, which a server reads except where its row says otherwise (`features.samplerKeys`). Which knobs
 *  ride at all is the capability's call, never this table's. */
export const DEFAULT_SAMPLER_KEYS: Readonly<Record<SamplerKnob, string>> = {
  temperature: "temperature",
  topP: "top_p",
  frequencyPenalty: "frequency_penalty",
  presencePenalty: "presence_penalty",
  seed: "seed",
  stop: "stop",
  topK: "top_k",
  minP: "min_p",
  topA: "top_a",
  repetitionPenalty: "repetition_penalty",
  repetitionPenaltyRange: "repeat_last_n",
  typicalP: "typical_p",
  topNSigma: "top_n_sigma",
  xtcProbability: "xtc_probability",
  xtcThreshold: "xtc_threshold",
  dryMultiplier: "dry_multiplier",
  dryBase: "dry_base",
  dryAllowedLength: "dry_allowed_length",
  dryPenaltyLastN: "dry_penalty_last_n",
  drySequenceBreakers: "dry_sequence_breakers",
  mirostatMode: "mirostat",
  mirostatTau: "mirostat_tau",
  mirostatEta: "mirostat_eta",
  dynatempRange: "dynatemp_range",
  dynatempExponent: "dynatemp_exponent",
  smoothingFactor: "smoothing_factor",
  smoothingCurve: "smoothing_curve",
  adaptiveTarget: "adaptive_target",
  adaptiveDecay: "adaptive_decay",
  minKeep: "min_keep",
  bannedStrings: "banned_strings",
  banEos: "ignore_eos",
  logitBias: "logit_bias",
};

/** How a server takes the phrase ban: `list` = the phrases under the row's `bannedStrings` key (KoboldCpp
 *  `banned_strings`, vLLM `bad_words`); `logit-bias-ban` = each phrase as a `logit_bias` key set to `false`, which
 *  llama.cpp tokenizes and bans itself (`server-schema.cpp` logit_bias handler). */
export const BANNED_STRINGS_SPELLINGS = ["list", "logit-bias-ban"] as const;

/** The tokenize endpoint a server answers, which turns a word-keyed logit bias into token ids and shows the
 *  editor what a word maps to. `wordKeysNative` = the server's own `logit_bias` takes word keys as they are. */
export const TOKENIZE_APIS = ["llama-cpp", "vllm", "koboldcpp"] as const;
export type TokenizeApi = (typeof TOKENIZE_APIS)[number];

/** How a reasoning token budget is spelled on this server's chat body (llama.cpp and KoboldCpp
 *  `thinking_budget_tokens`, vLLM `thinking_token_budget`). Absent ⇒ the wire has no budget field. */
export const REASONING_BUDGET_FIELDS = ["thinking_budget_tokens", "thinking_token_budget"] as const;

/** The sampler-order vocabularies a server may read. A row names one (`features.samplerOrder`); the tokens
 *  below spell it, so a server that reads a known vocabulary under another name is a row, not code. */
export const SAMPLER_ORDER_SPELLINGS = ["llama-cpp", "koboldcpp"] as const;
export type SamplerOrderSpelling = (typeof SAMPLER_ORDER_SPELLINGS)[number];

/** Each vocabulary's body key and per-stage token. A stage with no token is not orderable in it. llama.cpp:
 *  `common_sampler_types_from_names` canonical names; KoboldCpp: `expose.h` `enum samplers` ids, where min-p,
 *  DRY, XTC and top-n-sigma run at fixed places outside the order. */
export const SAMPLER_ORDER_TOKENS: Readonly<
  Record<SamplerOrderSpelling, { readonly key: string; readonly tokens: Readonly<Partial<Record<SamplerStage, string | number>>> }>
> = {
  "llama-cpp": {
    key: "samplers",
    tokens: {
      penalties: "penalties",
      dry: "dry",
      topNSigma: "top_n_sigma",
      topK: "top_k",
      typicalP: "typ_p",
      topP: "top_p",
      minP: "min_p",
      xtc: "xtc",
      temperature: "temperature",
      adaptiveP: "adaptive_p",
    },
  },
  koboldcpp: { key: "sampler_order", tokens: { penalties: 6, topK: 0, topA: 1, typicalP: 4, topP: 2, temperature: 5 } },
};

/** How a delivered trailing-assistant row is continued on this server. `continue-final-message` = vLLM's
 *  `continue_final_message: true` + `add_generation_prompt: false` pair; `deliver` = send the row and hope;
 *  `none` = the server has no continuation arm. Honoured only when the capability says
 *  `turns.assistantPrefill`. */
export const PREFILL_MODES = ["continue-final-message", "deliver", "none"] as const;

/** Whether a tool's `strict: true` input mode rides. `default-on` = strict unless the tool says otherwise (vLLM
 *  guided decoding); `declared-only` = only where the tool asks; `never` = the endpoint has no strict tool input.
 *  Response-format strictness is not this field's: it follows the endpoint's `structuredMode`. */
export const STRICT_JSON_MODES = ["default-on", "declared-only", "never"] as const;

/** How a generic effort level is spelled on this server's wire, if at all. */
export const EFFORT_SPELLINGS = ["reasoning_effort", "none"] as const;

/** How a turn tells the server's chat template whether to think. `chat_template_kwargs` = `enable_thinking`
 *  in the template kwargs, `false` on a reasoning-off turn and `true` on a reasoning-on one (Qwen3-style
 *  templates on vLLM, llama.cpp and KoboldCpp under `--jinja`); `reasoning_effort` = the effort field is the
 *  switch, so a turn the template must not think on sends `reasoning_effort: "none"` even with the preset unset
 *  (Ollama, which reads it as `think: false`); `none` = no switch beyond the effort field. */
export const THINKING_OFF_SPELLINGS = ["chat_template_kwargs", "reasoning_effort", "none"] as const;

/** Which image-generation arm the server exposes: the images API (`imageModel(id)` against
 *  `/v1/images/generations` + `/edits`) or chat-with-image-output (`modalities: ["text","image"]`). */
export const IMAGE_ARMS = ["images-api", "chat-modalities"] as const;

/** How the output cap is spelled on this server's chat-completions body. The SDK writes `max_tokens`;
 *  OpenAI's reasoning models 400 on it (`unsupported_parameter … Use 'max_completion_tokens'`, measured
 *  2026-09-20 on gpt-5-mini) and every current OpenAI chat model takes the new word, so the `openai` row
 *  declares it and the body shaper renames. Absent ⇒ the SDK's spelling stands. */
export const OUTPUT_CAP_FIELDS = ["max_tokens", "max_completion_tokens"] as const;

/** A server's native model-info API, read beside `/v1/models` for facts that list lacks: the window the
 *  server runs, an embedder's width, and what each model takes (tools, image input, its kind). `ollama` =
 *  `GET /api/version` + `GET /api/ps` + `POST /api/show`; `llama-cpp` = `GET /props` + the list's `meta`;
 *  `koboldcpp` = `GET /api/extra/version` + `GET /props`. The readers live in `@orb/inference`'s endpoint catalog. */
export const MODEL_INFO_APIS = ["ollama", "llama-cpp", "koboldcpp"] as const;
export type ModelInfoApi = (typeof MODEL_INFO_APIS)[number];

/** A server's native chat route, sent instead of `/v1/chat/completions` (D296). `ollama` = `POST /api/chat`,
 *  which takes `options.num_ctx` and the samplers the OpenAI route drops; `none` = `/v1`, the override that
 *  turns a provider row's native route off. Embeddings stay on `/v1`. */
export const NATIVE_CHAT_APIS = ["ollama", "none"] as const;
export type NativeChatApi = (typeof NATIVE_CHAT_APIS)[number];

export const endpointFeaturesSchema = z.object({
  prefill: z.enum(PREFILL_MODES).optional(),
  strictJson: z.enum(STRICT_JSON_MODES).optional(),
  /** The JSON-Schema vocabulary this endpoint's grammar compiles (`wire-subset.ts`); absent ⇒ the wire's default
   *  (`WIRE_STRUCTURED_MODE_DEFAULT`). */
  structuredMode: z.enum(WIRE_SCHEMA_MODES).optional(),
  effort: z.enum(EFFORT_SPELLINGS).optional(),
  outputCapField: z.enum(OUTPUT_CAP_FIELDS).optional(),
  images: z.enum(IMAGE_ARMS).optional(),
  modelInfoApi: z.enum(MODEL_INFO_APIS).optional(),
  nativeChat: z.enum(NATIVE_CHAT_APIS).optional(),
  /** Probe the connection's server for a known local server (KoboldCpp, llama.cpp, Ollama) and read the
   *  matching built-in row's features and model-info API in place of this row's. A declared `modelInfoApi`
   *  skips the probe; the connection's identity and credential stay this row's. */
  detectServer: z.boolean().optional(),
  /** A rerank endpoint path relative to `baseUrl` (vLLM `/rerank`); absent ⇒ the wire serves no rerank. */
  rerankPath: z.string().optional(),
  /** The sleep/wake pair a server exposes (vLLM `/is_sleeping` + `/wake_up`). Set ⇒ a sleeping server reads
   *  AVAILABLE and is woken before the request; unset ⇒ sleeping IS down. */
  sleep: z.object({ isSleepingPath: z.string(), wakePath: z.string() }).optional(),
  /** The measured vLLM interlock (§8.1, verify6 M2): a CONTENT prefill with thinking on ⇒ an empty reply, so
   *  the transport strips the thinking toggle on a prefill turn with `reasoning_dropped_for_prefill`. A row
   *  that leaves it unset gets the raw behaviour — the honest default for an unmeasured server. */
  prefillSuppressesThinking: z.boolean().optional(),
  /** The stream-delta field(s) the server puts reasoning in, read IN ORDER. vLLM ships
   *  `["reasoning", "reasoning_content"]` (0.26 renamed it; a `reasoning_content`-only read silently dropped
   *  every reasoning token, live-verified 2026-08-10). Applied by the transport's chunk reshaper. */
  reasoningKeys: z.array(z.string().min(1)).optional(),
  /** The key a sampler rides under on this server, where it differs from `DEFAULT_SAMPLER_KEYS` (llama.cpp
   *  reads `repeat_penalty`; KoboldCpp reads `typical`, `nsigma`, `rep_pen_range`, and on its OpenAI route
   *  only `mirostat_mode`). Folds key by key. */
  samplerKeys: z.partialRecord(z.enum(SAMPLER_KNOBS), z.string().min(1)).optional(),
  /** Further keys a sampler also rides under, on a server that reads several spellings and keeps the largest:
   *  KoboldCpp's chat route takes the repetition penalty as the maximum of `rep_pen`, `repeat_penalty` and
   *  `repetition_penalty`, each missing one counting as 1, so a value below 1 holds only when all three carry it
   *  (koboldcpp.py transform_genparams). A key the user's own body sets stands alone. */
  samplerAliases: z.partialRecord(z.enum(SAMPLER_KNOBS), z.array(z.string().min(1)).min(1)).optional(),
  /** The sampler-order vocabulary this server reads ({@link SAMPLER_ORDER_TOKENS}). */
  samplerOrder: z.enum(SAMPLER_ORDER_SPELLINGS).optional(),
  /** How the phrase ban rides ({@link BANNED_STRINGS_SPELLINGS}); absent ⇒ `list`. */
  bannedStrings: z.enum(BANNED_STRINGS_SPELLINGS).optional(),
  /** The tokenize endpoint behind word-keyed logit bias ({@link TOKENIZE_APIS}); absent ⇒ word keys cannot ride. */
  tokenizeApi: z.enum(TOKENIZE_APIS).optional(),
  /** The template-level thinking switch a turn sends, off or on ({@link THINKING_OFF_SPELLINGS}); absent ⇒ none. */
  thinkingOff: z.enum(THINKING_OFF_SPELLINGS).optional(),
  /** The body field a reasoning token budget rides under ({@link REASONING_BUDGET_FIELDS}). */
  reasoningBudgetField: z.enum(REASONING_BUDGET_FIELDS).optional(),
  /** Ollama's native route: how long the model stays loaded after a turn, as Ollama's duration string
   *  (`"30m"`, `"-1m"` = until the server stops). Absent ⇒ the server's default. */
  keepAlive: z.string().min(1).optional(),
  /** Ollama's native route: the prompt batch size (`options.num_batch`); a change reloads the model. */
  numBatch: z.number().int().positive().optional(),
  /** Feeds the `estimated` cost arm when the wire reports no usage cost (§5.3c). */
  pricing: z.object({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() }).optional(),
  /** Fan-out caps — THREE, one per surface that takes a `concurrency` dep. Wire default 4/8. NO env key. */
  concurrency: z
    .object({
      embed: z.number().int().positive().optional(),
      imageEmbed: z.number().int().positive().optional(),
      summarize: z.number().int().positive().optional(),
    })
    .optional(),
  /** The #187 per-POST token ceiling + derived deadline on embed: item-count batching alone let a 128-item
   *  POST reach ~1M tokens and head-of-line-block every other caller. Server-specific, so a feature. */
  embedBatch: z.object({ maxTokens: z.number().int().positive(), floorTokensPerSec: z.number().positive() }).optional(),
  /** The row's request deadline: the embed POST's deadline base, and the idle ceiling (the longest a turn may go
   *  without a received chunk) of every HTTP chat turn and of an agent-sdk side-generation turn. */
  requestTimeoutMs: z.number().int().positive().optional(),
});
export type EndpointFeatures = z.infer<typeof endpointFeaturesSchema>;

/** The wire's own defaults — what a row that says nothing gets. Today's `vllm/index.ts:52-53` fan-out. */
export const WIRE_DEFAULT_FEATURES: EndpointFeatures = {
  concurrency: { embed: 4, imageEmbed: 4, summarize: 8 },
};

/** Fold `wire default ← provider row ← connection.declared` field-wise: the connection's server is the
 *  truth, then the provider's shipped defaults, then the wire's. Field-wise means a row that sets only
 *  `prefill` keeps the provider's `sleep`; `samplerKeys` folds key by key, so overriding one spelling keeps the
 *  row's others. */
export function foldFeatures(...layers: readonly (EndpointFeatures | undefined)[]): EndpointFeatures {
  let folded: EndpointFeatures = { ...WIRE_DEFAULT_FEATURES };
  for (const layer of layers) {
    if (layer !== undefined) {
      // An empty map states nothing, so a fold where no layer names one keeps the key absent.
      const samplerKeys = { ...folded.samplerKeys, ...layer.samplerKeys };
      folded = {
        ...folded,
        ...layer,
        concurrency: { ...folded.concurrency, ...layer.concurrency },
        ...(Object.keys(samplerKeys).length > 0 ? { samplerKeys } : {}),
      };
    }
  }
  return folded;
}

/** The request-body keys the wire OWNS on every endpoint we build the body for — a key here in a
 *  connection's `extras` is DROPPED with `custom_parameters_ignored{key}`, never merged (D143(b)/D156,
 *  unchanged — F21). EIGHT keys, each with its failure written down:
 *    `truncate_prompt_tokens` / `truncation_side` — the engine-side truncation that #165 measured as an
 *      unbounded hang; the belt clamps client-side instead.
 *    `stream` / `stream_options` — the stream reducer's contract with the wire.
 *    `model` — the resolved connection's identity (window math, cost attribution, the catalog).
 *    `messages` — the assembled canon.
 *    `continue_final_message` / `add_generation_prompt` — the prefill pair: a stray value folds the next turn
 *      into the previous message or 400s outright; under `features.prefill` they are infra-owned.
 *  Moved here from `contracts/preset::VLLM_BELT_OWNED_PARAMETER_KEYS` with `extras` (§8.1c). */
export const BELT_OWNED_BODY_KEYS = [
  "truncate_prompt_tokens",
  "truncation_side",
  "stream",
  "stream_options",
  "model",
  "messages",
  "continue_final_message",
  "add_generation_prompt",
] as const;
export type BeltOwnedBodyKey = (typeof BELT_OWNED_BODY_KEYS)[number];

const BELT_OWNED_BODY_KEY_SET: ReadonlySet<string> = new Set<string>(BELT_OWNED_BODY_KEYS);

export function isBeltOwnedBodyKey(key: string): key is BeltOwnedBodyKey {
  return BELT_OWNED_BODY_KEY_SET.has(key);
}
