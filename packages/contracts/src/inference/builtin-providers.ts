// The SHIPPED provider rows — DATA in the one schema (`providerDefSchema`), checked at `tsc` through
// `satisfies` and parsed once at module load through the same zod a plugin/admin row goes through (§5.9).
// Most rows are `wire: openai-compat` + a `features` block and need ZERO code; adding a provider is a row
// here + the table test, never a `Record` entry.

import type { ProviderDefInput } from "./provider-schema.ts";

export const BUILTIN_PROVIDER_ROWS = [
  {
    id: "google",
    label: "Google Gemini",
    wire: "google-generative-ai",
    auth: "apiKey",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apis: ["google-generative-ai"],
    features: { structuredMode: "gemini-schema" },
    catalog: "url",
    metered: true,
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    wire: "openai-compat",
    dialect: "openrouter",
    auth: "apiKey",
    baseUrl: "https://openrouter.ai/api/v1",
    apis: ["chat-completions"],
    // The whole wire set. `rerank` rides the wire's plain-POST arm: OpenRouter answers `POST /rerank` with
    // the same `{ results: [{ index, relevance_score }] }` shape vLLM does (raw SDK 1.1.8 `rerankRerank`,
    // `pathToFunc("/rerank")`), so the row names the path like the vllm row does.
    // The adapter drops strict tool flags; response-format strictness is independent.
    features: { rerankPath: "/rerank", structuredMode: "strict-compatible", strictJson: "never" },
    catalog: "url",
    metered: true,
    docsUrl: "https://openrouter.ai/docs",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    wire: "anthropic-messages",
    auth: "apiKey",
    baseUrl: "https://api.anthropic.com",
    apis: ["anthropic-messages"],
    features: { structuredMode: "anthropic-format" },
    catalog: "url",
    metered: true,
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "claude-sub",
    label: "Claude subscription",
    wire: "agent-sdk",
    auth: "oauthToken",
    apis: ["agent-sdk"],
    // Each utility call is its own Claude subprocess, so the fan-out stays below the wire default.
    features: { structuredMode: "anthropic-format", concurrency: { summarize: 4 } },
    catalog: "url",
    metered: false,
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "openai",
    label: "OpenAI",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    baseUrl: "https://api.openai.com/v1",
    apis: ["chat-completions"],
    serves: ["chat", "summarize", "structured", "embed", "generateImage"],
    features: {
      effort: "reasoning_effort",
      // gpt-5.x / o-series reject the SDK's `max_tokens` (measured, `req_f68c8dc2e4a24908a2e5be64132edbc0`).
      outputCapField: "max_completion_tokens",
      images: "images-api",
      strictJson: "declared-only",
      structuredMode: "strict-compatible",
    },
    catalog: "url",
    metered: true,
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "nanogpt",
    label: "NanoGPT",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    // The direct API host: the website host, nano-gpt.com, caps a request body near 4.5 MB and can list another
    // catalog during a rollout (NanoGPT's API Hosts page).
    baseUrl: "https://api.nano-gpt.com/api/v1",
    apis: ["chat-completions"],
    // Embedding and rerank models sit in their own lists beside the models list, which the reader reads as their kinds.
    // The embeddings route takes text only for us: its image items are a per-model input shape the docs do not
    // give as a wire form, so `imageEmbed` stays off.
    serves: ["chat", "summarize", "structured", "embed", "rerank"],
    features: {
      effort: "reasoning_effort",
      modelInfoApi: "nanogpt",
      // The Rerank page: `POST /api/v1/rerank` answers `{ results: [{ index, relevance_score }] }`.
      rerankPath: "/rerank",
      // The chat-completion page spells the Mirostat switch `mirostat_mode`.
      samplerKeys: { mirostatMode: "mirostat_mode" },
      // The models list answers without a key, so the key check reads the personalized list, which answers 200 to
      // a good key and 401 to a wrong or missing one (NanoGPT's Personalized Models page; seen live).
      keyCheckPath: "/api/personalized/v1/models",
      // NanoGPT's Error Handling page: 401 is a missing or wrong key, while 403 is "authenticated but not
      // permitted", a model or feature the account may not use; its key codes sit on 401 (Feedback, OAuth PKCE pages).
      forbiddenIsNotCredentialVerdict: true,
    },
    catalog: "url",
    metered: true,
    docsUrl: "https://docs.nano-gpt.com",
  },
  {
    id: "literouter",
    label: "LiteRouter",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    baseUrl: "https://api.literouter.com/v1",
    apis: ["chat-completions"],
    // Image models answer on a separate host ({@link BUILTIN_IMAGE_BASE_URLS}), and the docs name no embedding route.
    serves: ["chat", "summarize", "structured", "generateImage"],
    features: {
      effort: "reasoning_effort",
      // The image host's OpenAI-format `POST /v1/images/generations` (Image Generation page): one `b64_json` image back.
      images: "images-api",
      modelInfoApi: "literouter",
      // A 403 is a refusal, not a key verdict: measured live, a misspelled model answered 403 "[LiteRouter] Model '…' is
      // not available or misspelled" and the plan cooldown 403 "[LiteRouter] Rate limit exceeded for your tier (7
      // seconds between messages)…". A bad key answers 401 (LiteRouter's Errors page).
      forbiddenIsNotCredentialVerdict: true,
    },
    catalog: "url",
    metered: true,
    docsUrl: "https://docs.literouter.com",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    // The direct API's versioned root; `GET /v1/models` answers there with the per-model facts (live 2026-11-16).
    // Both routes hang off this base: chat-completions at `/v1/chat/completions`, responses at `/v1/responses`
    // (the responses runner applies the same `openAiPath` convention; both measured 2026-11-16/17).
    baseUrl: "https://api.deepseek.com/v1",
    // Two protocols on one wire: the chat-completions body and `/v1/responses` (measured 2026-11-17: the
    // vendor answers `/v1/responses` for every id, though its list declares no `responses` capability —
    // per-model participation and every route fact live in the api-scoped cells, `curated/deepseek.ts`).
    apis: ["chat-completions", "responses"],
    serves: ["chat", "summarize", "structured"],
    features: {
      effort: "reasoning_effort",
      // The wire spells our `max` itself: `/models` `effort.supported_levels` names `max` and the field accepts it
      // (measured 2026-11-16; `xhigh` would sit silently under it).
      effortMaxLiteral: true,
      // `reasoning_effort: "none"` IS the thinking off (Thinking Mode guide; measured 2026-11-16: no
      // `reasoning_content` came back), so the effort field is the whole switch.
      thinkingOff: "reasoning_effort",
      // Tool-call strict mode is the only schema-enforcing structured vehicle it serves: `response_format`
      // `json_schema` 400s on both routes ("This response_format type is unavailable now", measured 2026-11-16).
      // The strict grammar is the OpenAI-shaped all-required/closed/anyOf-with-null set (measured 2026-11-16).
      strictJson: "default-on",
      structuredMode: "strict-compatible",
      // A trailing-assistant continue is a `prefix: true` flag on the row, served only on `/beta`.
      prefill: "prefix-flag",
      betaChatPath: "/beta",
      modelInfoApi: "deepseek",
      // The `/responses` route streams reasoning as raw `response.reasoning_text.*` frames, which the
      // SDK's chunk union drops silently; the dialect rewrites them onto the summary spelling
      // (`responses-dialect.ts`, measured 2026-11-17 against deepseek-v4-pro).
      responsesReasoningStream: "text",
    },
    catalog: "url",
    metered: true,
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "vllm",
    label: "vLLM",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    features: {
      prefill: "continue-final-message",
      strictJson: "default-on",
      structuredMode: "guided-decoding",
      effort: "reasoning_effort",
      sleep: {
        isSleepingPath: "/is_sleeping",
        wakePath: "/wake_up",
      },
      rerankPath: "/rerank",
      reasoningKeys: ["reasoning", "reasoning_content"],
      prefillSuppressesThinking: true,
      // chat_completion/protocol.py: the phrase ban is `bad_words`; `/tokenize` and `thinking_token_budget`.
      samplerKeys: { bannedStrings: "bad_words" },
      bannedStrings: "vllm-bad-words",
      tokenizeApi: "vllm",
      reasoningBudgetField: "thinking_token_budget",
      thinkingOff: "chat_template_kwargs",
    },
    catalog: "url",
    metered: false,
    docsUrl: "https://docs.vllm.ai",
  },
  {
    id: "lm-studio",
    label: "LM Studio",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    features: {
      prefill: "none",
      samplerKeys: { repetitionPenalty: "repeat_penalty" },
      structuredMode: "hosted-common",
    },
    catalog: "url",
    metered: false,
    docsUrl: "https://lmstudio.ai/docs",
  },
  {
    id: "ollama",
    label: "Ollama",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    features: {
      prefill: "none",
      // Ollama reads `reasoning_effort` as `think` on both chat routes (off for `none`); with no `think` a
      // thinking model thinks, so the effort field is also the template switch.
      effort: "reasoning_effort",
      thinkingOff: "reasoning_effort",
      modelInfoApi: "ollama",
      nativeChat: "ollama",
      structuredMode: "gbnf",
      // The `/api/chat` `options` spelling (api/types.go `Options`).
      samplerKeys: { repetitionPenalty: "repeat_penalty" },
    },
    catalog: "url",
    metered: false,
    docsUrl: "https://docs.ollama.com",
  },
  {
    id: "llama-cpp",
    label: "llama.cpp server",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    // The reader states tools from `/props` `chat_template_caps`, which the server reports even under
    // `--no-jinja` while refusing `tools[]` with "tools param requires --jinja flag"; the chat backend maps
    // that refusal to a readable error, and the user overrides tool calls to no under Advanced.
    features: {
      prefill: "none",
      modelInfoApi: "llama-cpp",
      // server.cpp registers `/rerank` and `/v1/rerank` alike, so the path joins under a root or a `/v1` base URL;
      // the server refuses it unless launched with `--reranking`, and the resolver only routes a rerank-kind model.
      rerankPath: "/rerank",
      samplerKeys: { repetitionPenalty: "repeat_penalty" },
      samplerOrder: "llama-cpp",
      bannedStrings: "logit-bias-ban",
      tokenizeApi: "llama-cpp",
      // server-common.cpp reads `reasoning_budget_tokens` or this alias on the chat route.
      reasoningBudgetField: "thinking_budget_tokens",
      thinkingOff: "chat_template_kwargs",
      structuredMode: "gbnf",
    },
    catalog: "url",
    metered: false,
    docsUrl: "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md",
  },
  {
    id: "koboldcpp",
    label: "KoboldCpp",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    features: {
      prefill: "none",
      modelInfoApi: "koboldcpp",
      // The OpenAI route overwrites `mirostat` with `mirostat_mode` (koboldcpp.py:4690).
      samplerKeys: {
        typicalP: "typical",
        topNSigma: "nsigma",
        repetitionPenaltyRange: "rep_pen_range",
        mirostatMode: "mirostat_mode",
        banEos: "ban_eos_token",
      },
      // transform_genparams keeps the largest of the three penalty spellings, a missing one counting as 1.
      samplerAliases: { repetitionPenalty: ["rep_pen", "repeat_penalty"] },
      samplerOrder: "koboldcpp",
      tokenizeApi: "koboldcpp",
      reasoningBudgetField: "thinking_budget_tokens",
      // koboldcpp.py transform_genparams merges `chat_template_kwargs` into the template's under `--jinja`.
      thinkingOff: "chat_template_kwargs",
      structuredMode: "gbnf",
    },
    catalog: "url",
    metered: false,
    docsUrl: "https://github.com/LostRuins/koboldcpp/wiki",
  },
  {
    id: "custom-openai",
    label: "Custom OpenAI-compatible",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    // The template thinking switch rides here too. A proxy that refuses `chat_template_kwargs` is answered by the
    // connection itself: `excludeBody` drops the key, its own body sets another value, or a declared
    // `thinkingOff: "none"` sends nothing. The user's body always wins over the switch (`openai-compat/body.ts`).
    features: { detectServer: true, thinkingOff: "chat_template_kwargs", structuredMode: "hosted-common" },
    catalog: "url",
    metered: false,
  },
  {
    id: "local-light",
    label: "Built-in (this device)",
    wire: "local-light",
    auth: "none",
    apis: [],
    catalog: "builtin",
    metered: false,
  },
] as const satisfies readonly ProviderDefInput[];

/**
 * The base URL a built-in row's image generation answers on, where its service puts images on another host than chat.
 *
 * @remarks SECURITY: the row's key is sent to this host. It lives beside the shipped rows and outside the persisted
 * provider row, so a plugin, admin or user row can never name a host that receives a key.
 */
export const BUILTIN_IMAGE_BASE_URLS: Readonly<Partial<Record<(typeof BUILTIN_PROVIDER_ROWS)[number]["id"], string>>> = {
  literouter: "https://image.literouter.com/v1",
};

/** A typical Server URL per built-in endpoint row, shown as the field placeholder. Static pane metadata kept out of
 *  the persisted provider row, so plugin and admin rows carry none. */
export const BUILTIN_EXAMPLE_BASE_URLS: Readonly<Record<string, string>> = {
  vllm: "http://localhost:8000",
  "lm-studio": "http://localhost:1234",
  ollama: "http://localhost:11434",
  "llama-cpp": "http://localhost:8080",
  koboldcpp: "http://localhost:5001",
};
