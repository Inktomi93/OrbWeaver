// `EndpointFeatures` — the CHAT body/stream quirk schema that replaces every server-named code path on the
// `openai-compat` wire (§8.1b). A provider row ships its servers' defaults, a connection overrides any field
// in `declared.features`, the transport reads the FOLDED block and never a provider id. There is no `vllm`
// dialect: vLLM is a row whose `features` say `prefill: continue-final-message`, `strictJson: default-on`,
// a sleep/wake path pair and a rerank path.
//
// SCOPE, HONESTLY: this is the chat quirk schema plus the three fan-out/deadline knobs the non-chat surfaces
// read. The non-chat surfaces' MEASURED behaviours (the ChatML wrap, the `dimensions` retry, the
// window clamps, the `<think>` strip) stay CODE keyed off the resolved capability — a feature is a knob a
// server dials, not a behaviour a wire carries.
//
// HOMED IN CONTRACTS, NOT THE PACKAGE: `BELT_OWNED_BODY_KEYS` has a live CLIENT reader (the Extras editor
// greys the belt keys) and `@orb/inference` is node-only.

// Strip mode: these schemas also read imported files and stored rows, which can carry keys this release does not declare; the wire parses a strict form (`strictTwin` or a `.strict()` view).
import { z } from "zod";
import type { SamplerKnob, SamplerStage } from "./capability/generation.ts";
import { SAMPLER_KNOBS } from "./capability/generation.ts";
import { tokenPricingSchema } from "./usage.ts";
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
 *  `banned_strings`); `logit-bias-ban` = each phrase as a `logit_bias` key set to `false`, which
 *  llama.cpp tokenizes and bans token by token for the whole reply, with no sequence context (`server-schema.cpp`
 *  logit_bias handler). On that spelling only a phrase that is one token rides; a longer one would ban each of its
 *  words everywhere, so it is dropped with a warning, and the row needs a `tokenizeApi` to tell them apart.
 *  `vllm-bad-words` = the list under the row's key, where vLLM bans the phrase as a token sequence in its bare form
 *  and adds the space-led form, the one met mid-sentence, only when that form is non-empty, starts on another token
 *  and has the bare form's token count (`SamplingParams.update_from_tokenizer`). A phrase that fails that test is
 *  banned only where no space precedes it, so it is dropped with a warning; the row needs a `tokenizeApi`. */
export const BANNED_STRINGS_SPELLINGS = ["list", "logit-bias-ban", "vllm-bad-words"] as const;

/** A request envelope that carries the extended samplers for a server's own logits processors. `vllm-xargs` = vLLM's
 *  `vllm_xargs` object, which reaches `SamplingParams.extra_args` and holds only strings, numbers and flat lists
 *  (`chat_completion/protocol.py`); stock vLLM reads none of these keys, so only a connection whose server loads
 *  processors that read them declares it. */
export const SAMPLER_ENVELOPES = ["vllm-xargs"] as const;
export type SamplerEnvelope = (typeof SAMPLER_ENVELOPES)[number];

/** What one envelope carries. `knobs` ride inside it under {@link DEFAULT_SAMPLER_KEYS} (llama.cpp's names, which the
 *  processors read). `logitBias` names the parallel id and value lists the bias rides as, since an envelope value
 *  cannot be an object. `repetitionWindow`: a set repetition range moves the penalty into the envelope beside the
 *  window, and without a range the penalty stays native, because the server refuses both at once. `closeThinking`:
 *  the key that, set `true` on a thinking turn, keeps the model from ending its turn inside its reasoning. */
export const SAMPLER_ENVELOPE_SPELLINGS: Readonly<
  Record<
    SamplerEnvelope,
    {
      readonly key: string;
      readonly knobs: readonly SamplerKnob[];
      readonly logitBias: { readonly ids: string; readonly values: string };
      readonly repetitionWindow: boolean;
      readonly closeThinking: string;
    }
  >
> = {
  "vllm-xargs": {
    key: "vllm_xargs",
    // min-p rides here too: vLLM refuses a native `min_p` under speculative decoding (`_validate_spec_decode`).
    knobs: [
      "minP",
      "topA",
      "topNSigma",
      "xtcProbability",
      "xtcThreshold",
      "dryMultiplier",
      "dryBase",
      "dryAllowedLength",
      "dryPenaltyLastN",
      "drySequenceBreakers",
      "dynatempRange",
      "dynatempExponent",
      "smoothingFactor",
      "smoothingCurve",
      "adaptiveTarget",
      "adaptiveDecay",
    ],
    logitBias: { ids: "bias_token_ids", values: "bias_logprobs" },
    repetitionWindow: true,
    closeThinking: "close_thinking",
  },
};

/** The top-level fields an antislop proxy reads ({@link EndpointFeatures.antislop}): the phrase ban, the slop list's
 *  name and strength, and the words the list must never push down. */
export const ANTISLOP_FIELDS = { bannedStrings: "banned_strings", slopList: "slop_list", slopStrength: "slop_strength", slopAllow: "slop_allow" } as const;

/** The features that drive a user's own server's samplers. A metered provider row never takes them: they would send
 *  fields a paid service does not define, so the resolver drops them there with a warning. */
export const OWN_SERVER_FEATURES = ["samplerEnvelope", "antislop", "slopList", "slopStrength"] as const satisfies readonly (keyof EndpointFeatures)[];

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
 *  `continue_final_message: true` + `add_generation_prompt: false` pair; `prefix-flag` = a `prefix: true` field
 *  stamped on the converted trailing-assistant message (DeepSeek's beta-route continue, live-verified 2026-11-16:
 *  prod hard-400s the field, `prefix is only available when using beta api`, so the row names a
 *  {@link EndpointFeatures.betaChatPath} and the turn takes it); `deliver` = send the row and hope;
 *  `none` = the server has no continuation arm. Honoured only when the capability says
 *  `turns.assistantPrefill`. */
export const PREFILL_MODES = ["continue-final-message", "prefix-flag", "deliver", "none"] as const;

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
 *  on gpt-5-mini) and every current OpenAI chat model takes the new word, so the `openai` row
 *  declares it and the body shaper renames. Absent ⇒ the SDK's spelling stands. */
export const OUTPUT_CAP_FIELDS = ["max_tokens", "max_completion_tokens"] as const;

/** A server's native model-info API, read beside `/v1/models` for facts that list lacks: the window the
 *  server runs, an embedder's width, and what each model takes (tools, image input, its kind). `ollama` =
 *  `GET /api/version` + `GET /api/ps` + `POST /api/show`; `llama-cpp` = `GET /props` + the list's `meta`;
 *  `koboldcpp` = `GET /api/extra/version` + `GET /props`; `nanogpt` = the hosted list's own `?detailed=true` mode,
 *  read in place of the bare list; `literouter` = the hosted list's own per-model fields, read from the same list;
 *  `deepseek` = the hosted list's own per-model fields (`context_window`, `max_output_tokens`, `input_modalities`,
 *  `effort.supported_levels`), read from the same list. The
 *  readers live in `@orb/inference`'s endpoint catalog. */
export const MODEL_INFO_APIS = ["ollama", "llama-cpp", "koboldcpp", "nanogpt", "literouter", "deepseek"] as const;
export type ModelInfoApi = (typeof MODEL_INFO_APIS)[number];

/** A server's native chat route, sent instead of `/v1/chat/completions` (D310). `ollama` = `POST /api/chat`,
 *  which takes `options.num_ctx` and the samplers the OpenAI route drops; `none` = `/v1`, the override that
 *  turns a provider row's native route off. Embeddings stay on `/v1`. */
export const NATIVE_CHAT_APIS = ["ollama", "none"] as const;
export type NativeChatApi = (typeof NATIVE_CHAT_APIS)[number];

/** The `/responses` route's reasoning-stream spelling. `summary` (absent ⇒ this) = the OpenAI summary events
 *  the SDK folds into reasoning parts; `text` = raw `response.reasoning_text.delta` frames, which the SDK's
 *  chunk union silently DROPS as unknown chunks — the runner then rewrites them onto the summary spelling at
 *  the fetch seam (`responses-dialect.ts`; MEASURED DeepSeek 2026-11-17: reasoning streams as
 *  `reasoning_text.delta/done` and no summary events arrive at all). */
export const RESPONSES_REASONING_STREAMS = ["summary", "text"] as const;

/** The most side-generation items a connection runs at once. An agent-sdk item is its own Claude subprocess, so the
 *  bound holds on every wire rather than per backend. */
export const SUMMARIZE_CONCURRENCY_MAX = 32;

/** A declared request path: `/`-led segments of plain path characters, so the URL built from it, joined to the base URL
 *  or resolved against it, stays on the base URL's origin. No empty segment (`//host` is another host), no `.` or `..`
 *  segment, and no backslash, `@`, `%`, query, space or control character (the URL parser reads a backslash as `/` and
 *  drops a tab or newline). */
const DECLARED_PATH_RE = /^(?:\/(?!\.{1,2}(?:\/|$))[\w\-.~!$&'()*+,;=:]+)+\/?$/u;

// SECURITY: every declared path rides the row's key, so a path the parse admits never names another host. The backends
// check the built URL's origin again before they send (`onBaseOrigin` in packages/inference/src/backends/http/fetch-json.ts,
// and the key check's `readUrl`).
const declaredPathSchema = z.string().regex(DECLARED_PATH_RE, "a declared path is a plain path such as /v1/me, with no host");

export const endpointFeaturesSchema = z
  .object({
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
    /** The `/responses` reasoning-stream event spelling; absent ⇒ `summary` (the SDK-native fold). See
     *  {@link RESPONSES_REASONING_STREAMS}. */
    responsesReasoningStream: z.enum(RESPONSES_REASONING_STREAMS).optional(),
    /** Probe the connection's server for a known local server (KoboldCpp, llama.cpp, Ollama) and read the
     *  matching built-in row's features and model-info API in place of this row's. A declared `modelInfoApi`
     *  skips the probe; the connection's identity and credential stay this row's. */
    detectServer: z.boolean().optional(),
    /** The key check's read, a path from the base URL's ORIGIN, for a service whose models list answers without a key;
     *  absent ⇒ the models list under the base URL. A plain path only ({@link DECLARED_PATH_RE}), because the read
     *  carries the key. Any row may declare one (a server behind a proxy whose list needs no key); this parse and the
     *  read's own origin check keep the key on the row's base URL origin. */
    keyCheckPath: declaredPathSchema.optional(),
    /** The service answers 403 for refusals that say nothing about the key (a model the plan lacks, a cooldown),
     *  so a 403 is a refusal shown in the service's words unless its body's structured `error.code` names the key
     *  (`invalid_api_key`, `missing_api_key`). Absent ⇒ every 403 judges the key. */
    forbiddenIsNotCredentialVerdict: z.boolean().optional(),
    /** A rerank endpoint path relative to `baseUrl` (vLLM `/rerank`); absent ⇒ the wire serves no rerank. */
    rerankPath: declaredPathSchema.optional(),
    /** The sleep/wake pair a server exposes (vLLM `/is_sleeping` + `/wake_up`), at the server root. Set ⇒ a sleeping
     *  server reads AVAILABLE and is woken before the request; unset ⇒ sleeping IS down. */
    sleep: z.object({ isSleepingPath: declaredPathSchema, wakePath: declaredPathSchema }).strip().optional(),
    /** The measured vLLM interlock (§8.1): a CONTENT prefill with thinking on ⇒ an empty reply, so
     *  the transport strips the thinking toggle on a prefill turn with `reasoning_dropped_for_prefill`. A row
     *  that leaves it unset gets the raw behaviour — the honest default for an unmeasured server. */
    prefillSuppressesThinking: z.boolean().optional(),
    /** The stream-delta field(s) the server puts reasoning in, read IN ORDER. vLLM ships
     *  `["reasoning", "reasoning_content"]`: a `reasoning_content`-only read silently drops every reasoning
     *  token, so both names are read. Applied by the transport's chunk reshaper. */
    reasoningKeys: z.array(z.string().min(1)).optional(),
    /** A generic effort level rides this server's effort field verbatim, including our `max`: the wire's own
     *  vocabulary spells that word (`reasoning_effort: "max"`, measured on DeepSeek 2026-11-16 — its `/models`
     *  `effort.supported_levels` names `max` and the field accepts it). Absent ⇒ the V4 mapping holds and our
     *  `max` rides as the wire's `xhigh`. */
    effortMaxLiteral: z.boolean().optional(),
    /** The route serving this server's beta-gated chat request fields (`prefix`, strict tool mode), as a plain
     *  path from the base URL's ORIGIN (DeepSeek: `/beta`, live-verified 2026-11-16 — prod 400s `prefix` and
     *  docs gate strict-mode behind it). Read only on a turn that sends a beta-gated field: the
     *  `prefix-flag` prefill turn and a turn carrying a `strict: true` tool. Absent ⇒ no separate beta route. */
    betaChatPath: declaredPathSchema.optional(),
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
    /** The envelope the extended samplers ride in ({@link SAMPLER_ENVELOPE_SPELLINGS}); absent ⇒ they ride the body top level. */
    samplerEnvelope: z.enum(SAMPLER_ENVELOPES).optional(),
    /** The server is an antislop proxy: banned phrases ride whole as its top-level list, which it enforces by rewinding,
     *  and the slop list fields ride beside them ({@link ANTISLOP_FIELDS}). */
    antislop: z.boolean().optional(),
    /** The antislop proxy's slop list to apply, by the name the proxy knows it under; read only with `antislop`. */
    slopList: z.string().min(1).optional(),
    /** How hard the slop list pushes its words down (each weight raised to this power); read only with a `slopList`. */
    slopStrength: z.number().positive().optional(),
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
    numBatch: z.int().positive().optional(),
    /** Feeds the `estimated` cost arm when the wire reports no usage cost (§5.3c). */
    pricing: tokenPricingSchema.optional(),
    /** Fan-out caps — THREE, one per surface that takes a `concurrency` dep. Wire default 4/8. NO env key. */
    concurrency: z
      .object({
        embed: z.int().positive().optional(),
        imageEmbed: z.int().positive().optional(),
        summarize: z.int().positive().max(SUMMARIZE_CONCURRENCY_MAX).optional(),
      })
      .strip()
      .optional(),
    /** The per-POST token ceiling + derived deadline on embed: item-count batching alone let a 128-item
     *  POST reach ~1M tokens and head-of-line-block every other caller. Server-specific, so a feature. */
    embedBatch: z.object({ maxTokens: z.int().positive(), floorTokensPerSec: z.number().positive() }).strip().optional(),
    /** The row's request deadline: the embed POST's deadline base, and the idle ceiling (the longest a turn may go
     *  without a received chunk) of every HTTP chat turn and of an agent-sdk side-generation turn. */
    requestTimeoutMs: z.int().positive().optional(),
  })
  .strip();
export type EndpointFeatures = z.infer<typeof endpointFeaturesSchema>;

/** The wire's own defaults — what a row that says nothing gets. */
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

// The request-body keys the wire OWNS on every endpoint we build the body for — a key here in a
//  connection's `extras` is DROPPED with `custom_parameters_ignored{key}`, never merged (D311). EIGHT keys,
//  each with its failure written down:
//    `truncate_prompt_tokens` / `truncation_side` — the engine-side truncation measured as an
//      unbounded hang; the belt clamps client-side instead.
//    `stream` / `stream_options` — the stream reducer's contract with the wire.
//    `model` — the resolved connection's identity (window math, cost attribution, the catalog).
//    `messages` — the assembled canon.
//    `continue_final_message` / `add_generation_prompt` — the prefill pair: a stray value folds the next turn
//      into the previous message or 400s outright; under `features.prefill` they are infra-owned.
const BELT_OWNED_BODY_KEYS = [
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
