// ONE chat turn on the openai-compat wire over a V4 `doStream`. The turn: the funnel resolves the
// knobs ONCE (`resolveChat`), the shared prompt builder lays out the wire plan, the placer decides the cache
// breakpoints (openrouter on an Anthropic route), the dialect's option builder spells what the SDK models
// natively, the transport's hooks shape the rest of the body, the shared reducer drains the stream, and the
// result mapper folds usage/cost/finish onto the one `ChatResult` record. Pre-commit retry + the
// openrouter mandatory-reasoning strip-and-replay-once ride `runWithPreCommitRetry`; every degrade is a
// `warning` event (D41).

import type { JSONObject, LanguageModelV4CallOptions, SharedV4Headers, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { CachePolicy, Dialect, EndpointFeatures, GenerationCapability, ResolvedWarning, ResponseCache } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, cacheMinTokensOf, DEFAULT_ATTACHMENT_QUALITY, honoursParallelControl } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import { errorMessage } from "@orb/kit/error-message";
import type { JsonValue } from "@orb/kit/json";
import type { Clock, ScheduleOp } from "@orb/kit/time";
import { z } from "zod";
import type { ChatHistoryMessage, ChatResult, OpenAiCompatChatRequest, RateLimitSnapshot, Resolved, ResolvedChatKnobs } from "#contract";
import { ProviderError, requireGeneration } from "#contract";
import { resolveCachePolicy, resolveChat, templateThinkingFor } from "#funnel";
import type { ProviderLogger } from "#src/contract/http.ts";
import type { ModelCall, OpenAiCompatChatDeps } from "#src/contract/openai-backend.ts";
import type { PlannedTool, StructuredPlan } from "#src/contract/structured.ts";
import type { StreamDrain, WirePlan } from "#src/contract/v4.ts";
import type { ExplicitCachePlan, OpenRouterRouting } from "#src/contract/wire.ts";
import { requireStructuredPlan, structuredChatResult } from "#structured";
import { extractHttpErrorDiagnostic, forbiddenAsRefusal, providerErrorFromHttp, refusalWords, withSchemaRejection } from "../http/error-classify.ts";
import { observeChatResult } from "../http/generation-observation.ts";
import { turnAbortSignal } from "../http/idle-timeout.ts";
import { providerLogger } from "../http/provider-log.ts";
import { rateLimitCanaryEvent, rateLimitFromHeaders } from "../http/rate-limit-headers.ts";
import { cachePolicyContextOf, effectiveDialectOf, implicitPromptCacheFields, responseCacheOf } from "../http/response-cache.ts";
import { runWithPreCommitRetry } from "../http/retry.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../http/sanitize.ts";
import { emitTurnSpanEvents } from "../http/turn-span.ts";
import { plannedOptions, standardSampling } from "../v4/options.ts";
import { buildWirePlan, withMessageOptions } from "../v4/prompt.ts";
import { emitTurnReceipts, measuredCostOf, sdkWarnings, toChatResult } from "../v4/result.ts";
import { drainStream } from "../v4/stream.ts";
import { effortWordOf } from "../wire/applied-effort.ts";
import { automaticCachePlan, effectiveProviderRouting, explicitCachePlan, isAnthropicModel, placeExplicitCacheMarkers } from "../wire/cache-control.ts";
import { languageModelFor, providerOptionsKey } from "./model.ts";
import { compatibleReasoning, isMandatoryReasoningRejection, openRouterReasoning, sendsOpenRouterReasoning } from "./reasoning.ts";
import { wireSampling } from "./sampling.ts";
import { resolveWordBias } from "./tokens.ts";

const MANDATORY_REPLAY_WARNING = "reasoning is mandatory on this endpoint: the turn ran at the model's own effort";
/** llama.cpp server refuses `tools[]` under `--no-jinja` while its `/props` still reports the template's tool
 *  support, so the reader cannot see it coming; the 400 is the first signal and it must read as the fix. */
const JINJA_TOOLS_RE = /requires --jinja flag/iu;
const JINJA_TOOLS_MESSAGE =
  "this llama.cpp server runs without --jinja, so tool calls are off; start it with --jinja, or under Advanced press Override on tool calls and choose no";
/** A chat template refusing the conversation's message roles, in the words the common templates raise with
 *  (Qwen's "System message must be at the beginning.", Llama/Mistral's "roles must alternate"). llama.cpp, vLLM
 *  and Ollama's native mode all render the template server-side and hand the exception back, llama.cpp as a 500. */
const TEMPLATE_ROLE_RE = /system message must be at the beginning|roles must alternate|unexpected message role|system role (?:is )?not supported/iu;
/** The fix names the preset control that decides where a system row may sit (Prompt tab · Message handling). */
const TEMPLATE_ROLE_MESSAGE =
  "the model's chat template refused this conversation's message roles; in the preset's Prompt tab, set Message handling › Adjacent-role merging to a stricter level";
const CONTEXT_COMPRESSION_PLUGIN = "context-compression";
const MIDDLE_OUT_ENGINE = "middle-out";
const OPENROUTER_KEY = "openrouter";
const REASONING_OFF = "none";
const OLLAMA_THINK_KEY = "think";
const SESSION_ID_HEADER = "x-session-id";
const SESSION_ID_MAX_LENGTH = 256;
const openRouterSessionSchema = z.string().max(SESSION_ID_MAX_LENGTH);

/** The openrouter routing-prefs shape a connection's `extras.provider` may carry (snake_case, OR's own
 *  vocabulary — validated here, the ONE reader). A malformed block is dropped loudly, never sent. */
const openRouterRoutingSchema = z
  .object({
    order: z.array(z.string()),
    allow_fallbacks: z.boolean(),
    require_parameters: z.boolean(),
    data_collection: z.enum(["allow", "deny"]),
    only: z.array(z.string()),
    ignore: z.array(z.string()),
    quantizations: z.array(z.string()),
    sort: z.enum(["price", "throughput", "latency"]),
    max_price: z.record(z.string(), z.union([z.number(), z.string()])),
  })
  .strip()
  .partial();

function upstreamText(error: unknown): string {
  const diag = extractHttpErrorDiagnostic(error, NO_PROVIDER_SECRETS);
  return `${diag.body ?? ""} ${diag.cause ?? ""} ${errorMessage(error)}`;
}

// True when the upstream 400 is llama.cpp refusing `tools[]` on a server started without `--jinja`.
function isJinjaToolsRefusal(error: unknown): boolean {
  return JINJA_TOOLS_RE.test(upstreamText(error));
}

/** The server's own text for a refusal this file re-voices, so a reader can still see what it said. */
const TEMPLATE_DETAIL_LIMIT = 200;

/** A template-role refusal as the fix it needs: not retryable (the same rows fail the same way), and naming the
 *  preset control, with the matched refusal phrase quoted (not the server's whole message). */
function templateRoleRefusal(error: unknown, label: string, classified: ProviderError): ProviderError | null {
  const match = TEMPLATE_ROLE_RE.exec(upstreamText(error));
  if (match === null) {
    return null;
  }
  return new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `${label}: ${TEMPLATE_ROLE_MESSAGE} (the server said: ${match[0].slice(0, TEMPLATE_DETAIL_LIMIT)})`,
    ...(classified.apiErrorStatus !== undefined ? { apiErrorStatus: classified.apiErrorStatus } : {}),
    cause: classified,
  });
}

// ── cache placement (OpenRouter explicit-cache routes) ────────────────────────────────────────────────────────

interface CacheWriteReceipt {
  readonly requestBlocks: number;
  readonly historyDepths: readonly number[];
  readonly systemBlocks: number;
}

interface CachePlacement {
  readonly patches: ReadonlyMap<number, Record<string, unknown>>;
  readonly written: CacheWriteReceipt;
}

/** Place only markers admitted by the resolved route and connection settings. */
function placeCache(args: {
  readonly plan: WirePlan;
  readonly req: OpenAiCompatChatRequest;
  readonly cachePlan: ExplicitCachePlan | null;
  readonly generation: GenerationCapability;
  readonly log: ProviderLogger;
  readonly anthropicRoute: boolean;
  readonly automaticCache: ExplicitCachePlan | null;
}): CachePlacement {
  const { plan, req, generation, log } = args;
  const placed = placeExplicitCacheMarkers({
    plan: args.cachePlan,
    systemMinTokens: args.anthropicRoute ? 0 : cacheMinTokensOf(generation),
    rows: plan.rows,
    staticSystem: req.systemPrompt.static.trim(),
    generation,
    log,
  });
  return {
    patches: placed.patches,
    written: { historyDepths: placed.historyDepths, systemBlocks: placed.systemBlocks, requestBlocks: args.automaticCache === null ? 0 : 1 },
  };
}

// ── the per-dialect option builders ───────────────────────────────────────────────────────────────────────

/** The turn's resolved knobs and their wire spelling, both computed once per turn (never per attempt). */
interface TurnKnobs {
  readonly automaticCache: ExplicitCachePlan | null;
  readonly knobs: ResolvedChatKnobs;
  readonly sampling: ReturnType<typeof wireSampling>;
  /** {@link templateThinkingFor}: body rule 5b sends it on a `chat_template_kwargs` row, the effort word on a `reasoning_effort` one. */
  readonly templateThinking: boolean | undefined;
  /** The turn's tools, tool choice and structured payload as planned (`structured/plan.ts`). */
  readonly plan: StructuredPlan;
  /** `parallel_tool_calls: false` rides ({@link disablesParallelToolCalls}). */
  readonly parallelOff: boolean;
}

/** The planned response format's strictness, where one rides natively. */
function plannedStrict(plan: StructuredPlan): boolean | undefined {
  return plan.responseFormat?.vehicle === "response-format" ? plan.responseFormat.strict : undefined;
}

/** Whether this turn must be built against the row's beta route (`features.betaChatPath`, `model.ts`): a
 *  `prefix-flag` turn that may stamp — the body shaper's rule 5a is the narrow gate, this is its superset, so
 *  every possible stamp rides `/beta` — or any turn carrying a strict tool: strict tool mode is the vendor's
 *  beta feature, its guarantee lives on `/beta` and prod only tolerates the flag. */
function betaRouteNeeded(
  prefill: EndpointFeatures["prefill"],
  prefillAllowed: boolean,
  endsOnAssistant: boolean,
  tools: readonly PlannedTool[] | undefined,
): boolean {
  return (prefill === "prefix-flag" && prefillAllowed && endsOnAssistant) || tools?.some((tool) => tool.strict === true) === true;
}

type TurnShape = {
  readonly options: Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal">;
  readonly extraBody: Record<string, unknown>;
} & (
  | { readonly openRouterChat: NonNullable<ModelCall["openRouterChat"]>; readonly templateOff?: never }
  | { readonly openRouterChat?: never; readonly templateOff?: boolean | undefined }
);

/** The openai-compatible transport: effort and the budget spelled by the row (`reasoning.ts`); verbosity rides the
 *  SDK's `textVerbosity` option; the unmodelled sampler knobs ride `providerOptions[name]` under the row's own
 *  spelling, which the SDK spreads into the body. */
function openAiCompatibleShape(req: OpenAiCompatChatRequest, turn: TurnKnobs, warnings: ResolvedWarning[], key: string): TurnShape {
  const { connection } = req;
  const { knobs, sampling } = turn;
  const { word: effort, body: budget, templateOff } = compatibleReasoning(connection.features, knobs.reasoning, turn.templateThinking, warnings);
  const strict = plannedStrict(turn.plan);
  const providerOptions: SharedV4ProviderOptions = {
    [key]: {
      ...sampling.body,
      ...budget,
      ...(knobs.verbosity !== undefined ? { textVerbosity: knobs.verbosity } : {}),
      ...(strict !== undefined ? { strictJsonSchema: strict } : {}),
    },
  };
  return {
    options: {
      ...standardSampling(sampling.v4, knobs.maxOutputTokens),
      ...(effort !== undefined ? { reasoning: effort } : {}),
      ...plannedOptions(turn.plan),
      providerOptions,
    },
    extraBody: parallelToolCallsBody(turn),
    templateOff,
  };
}

/** The preset asked for one tool call at a time on a tools request. Only `false` goes out: a stored `true` is the
 *  endpoint's own default, and some OpenAI-compatible layers refuse the field (Gemini answers
 *  `Unknown name "parallel_tool_calls"`). A server that does not read the field (`tools.parallelControl: false`)
 *  is not sent it, and the turn says so: no local serialization makes the model emit one call. */
function disablesParallelToolCalls(req: OpenAiCompatChatRequest, plan: StructuredPlan, generation: GenerationCapability, warnings: ResolvedWarning[]): boolean {
  if (plan.tools === undefined || req.params.advanced?.parallelToolCalls !== false) {
    return false;
  }
  if (honoursParallelControl(generation)) {
    return true;
  }
  warnings.push({
    code: "sampling_knob_dropped",
    knob: "parallelToolCalls",
    message: "parallelToolCalls ignored: this server does not read parallel_tool_calls, so the model may still call several tools at once",
  });
  return false;
}

// The @ai-sdk/openai-compatible provider models no `parallel_tool_calls`, so the switch rides the raw body.
function parallelToolCallsBody(turn: TurnKnobs): Record<string, unknown> {
  return turn.parallelOff ? { parallel_tool_calls: false } : {};
}

/** THE OPENROUTER PLUGIN UNION, validated against the provider's own `OpenRouterChatSettings.plugins`
 *  shape (`@openrouter/ai-sdk-provider@3.1.0`) — five ids, each with its own fields. Spelled here
 *  because this file is the ONE reader of `extras` on this transport; a malformed entry drops loudly and is
 *  never sent. `response-healing` is the reason this door is worth opening: it is OpenRouter's server-side
 *  repair for the malformed JSON our non-streaming structured task otherwise has to re-ask for. */
const openRouterPluginSchema = z.discriminatedUnion("id", [
  z
    .object({ id: z.literal("web"), max_results: z.number().int().positive().optional(), search_prompt: z.string().optional(), engine: z.string().optional() })
    .strip(),
  z
    .object({
      id: z.literal("file-parser"),
      max_files: z.number().int().positive().optional(),
      pdf: z.object({ engine: z.string().optional() }).strip().optional(),
    })
    .strip(),
  z.object({ id: z.literal("moderation") }).strip(),
  z.object({ id: z.literal("response-healing") }).strip(),
  z.object({ id: z.literal("auto-router"), allowed_models: z.array(z.string()).optional() }).strip(),
]);

/** OR's request DEBUG block (`debug.echo_upstream_body`, `@openrouter/ai-sdk-provider@3.1.0`) — the `debug`
 *  extras door. `echo_upstream_body` makes OpenRouter return, as the FIRST SSE frame, the body it actually
 *  sent upstream after routing and caching: the only way to see what a routed provider received rather than
 *  what we asked OR for. It is a REQUEST BODY field and its payload rides the ordinary stream, so the wire
 *  capture's own reply tap (`WIRE_CAPTURE_REPLY`, `backends/v4/fetch.ts` control 4b) is what surfaces it —
 *  the SDK's `includeRawChunks` is NOT involved, and deliberately not taken (that file's header records why).
 *  Streaming-only per the dist's own note; a non-streaming call simply gets nothing back. */
const openRouterDebugSchema = z.object({ echo_upstream_body: z.boolean().optional() }).strip();

/** OR's built-in web-search options (`web_search_options`, `@openrouter/ai-sdk-provider@3.1.0`) — a sibling of the `web`
 *  plugin, not a duplicate of it: the plugin ADDS search to a model that has none, these options configure a
 *  model whose own search is native. */
const openRouterWebSearchSchema = z
  .object({
    max_results: z.number().int().positive().optional(),
    search_prompt: z.string().optional(),
    engine: z.string().optional(),
  })
  .strip();

/** THE PLUGIN MERGE: the turn-owned context-compression entry FIRST, then the user's declared
 *  plugins. Order is the precedence, and compression leads on purpose — it is the one plugin whose value
 *  this layer decides (off `params.providerContextCompression`), so a user entry re-declaring
 *  `context-compression` must not silently take the turn's decision away. Such an entry is dropped with the
 *  belt's own `custom_parameters_ignored` code: a hosted row's allowlist never takes a modelled knob (D311). */
function mergePlugins(compression: JSONObject, extras: Resolved["extras"], warnings: ResolvedWarning[]): readonly JSONObject[] {
  const declared = extras?.["plugins"];
  if (declared === undefined) {
    return [compression];
  }
  // The turn-owned entry is stripped BEFORE the union parse, not after: `context-compression` is deliberately
  // absent from the modelled union, so leaving a user's copy in would fail the WHOLE block with a generic
  // "not a plugin list" message instead of naming the one entry this layer owns.
  const list: readonly JsonValue[] = Array.isArray(declared) ? declared : [];
  const isOwn = (entry: JsonValue): boolean =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry) && entry["id"] === CONTEXT_COMPRESSION_PLUGIN;
  if (list.some(isOwn)) {
    warnings.push({
      code: "custom_parameters_ignored",
      key: "plugins",
      message: `extras.plugins entry "${CONTEXT_COMPRESSION_PLUGIN}" ignored: the turn owns context compression (the preset's providerContextCompression knob)`,
    });
  }
  const parsed = z.array(openRouterPluginSchema).safeParse(Array.isArray(declared) ? list.filter((entry) => !isOwn(entry)) : declared);
  if (!parsed.success) {
    warnings.push({ code: "custom_parameters_ignored", key: "plugins", message: "extras.plugins ignored: not a list of openrouter plugin entries" });
    return [compression];
  }
  return [compression, ...(parsed.data as readonly JSONObject[])];
}

/** `web_search_options` off `extras`, validated; a malformed block drops loudly and is never sent. */
function webSearchOptions(extras: Resolved["extras"], warnings: ResolvedWarning[]): JSONObject | undefined {
  const declared = extras?.["web_search_options"];
  if (declared === undefined) {
    return;
  }
  const parsed = openRouterWebSearchSchema.safeParse(declared);
  if (!parsed.success) {
    warnings.push({
      code: "custom_parameters_ignored",
      key: "web_search_options",
      message: "extras.web_search_options ignored: not a valid openrouter web-search block",
    });
    return;
  }
  return parsed.data;
}

/** `debug` off `extras`, validated; a malformed block drops loudly and is never sent. */
function debugOptions(extras: Resolved["extras"], warnings: ResolvedWarning[]): JSONObject | undefined {
  const declared = extras?.["debug"];
  if (declared === undefined) {
    return;
  }
  const parsed = openRouterDebugSchema.safeParse(declared);
  if (!parsed.success) {
    warnings.push({ code: "custom_parameters_ignored", key: "debug", message: "extras.debug ignored: not a valid openrouter debug block" });
    return;
  }
  return parsed.data;
}

/** The two extras keys the openrouter transport MODELS (`provider` routing prefs, `models` fallback chain),
 *  validated here — a malformed block is dropped loudly, never sent. The Anthropic pin folds in when the
 *  user set no routing (`effectiveProviderRouting`). */
function openRouterExtras(
  connection: Resolved,
  warnings: ResolvedWarning[],
): { readonly routing: OpenRouterRouting | undefined; readonly models: readonly string[] | undefined } {
  const extras = connection.extras ?? {};
  const parsedRouting = extras["provider"] === undefined ? undefined : openRouterRoutingSchema.safeParse(extras["provider"]);
  if (parsedRouting?.success === false) {
    warnings.push({ code: "custom_parameters_ignored", key: "provider", message: "extras.provider ignored: not a valid openrouter routing block" });
  }
  const parsedModels = extras["models"] === undefined ? undefined : z.array(z.string()).min(1).safeParse(extras["models"]);
  if (parsedModels?.success === false) {
    warnings.push({ code: "custom_parameters_ignored", key: "models", message: "extras.models ignored: not a non-empty list of model ids" });
  }
  return {
    routing: effectiveProviderRouting(connection, parsedRouting?.success === true ? parsedRouting.data : undefined),
    models: parsedModels?.success === true ? parsedModels.data : undefined,
  };
}

function openRouterSession(req: OpenAiCompatChatRequest): Record<string, unknown> {
  const extras = req.connection.extras;
  const bodySession = extras?.["session_id"];
  const headerSession = new Headers(req.connection.transport?.headers).get(SESSION_ID_HEADER);
  if (bodySession !== undefined) {
    const parsed = openRouterSessionSchema.safeParse(bodySession);
    if (!parsed.success) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "OpenRouter session_id must be a string of at most 256 characters" });
    }
    return { session_id: parsed.data };
  }
  if (headerSession !== null) {
    if (!openRouterSessionSchema.safeParse(headerSession).success) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "OpenRouter x-session-id must be at most 256 characters" });
    }
    return {};
  }
  const cacheKey = extras?.["prompt_cache_key"];
  if (cacheKey !== undefined) {
    if (typeof cacheKey !== "string") {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "OpenRouter prompt_cache_key must be a string" });
    }
    return { prompt_cache_key: cacheKey };
  }
  if (req.chatId === undefined) {
    return {};
  }
  return { session_id: req.chatId };
}

/** The openrouter transport: reasoning nested under `providerOptions.openrouter`, routing + the fallback
 *  chain off `extras`, the managed context-compression plugin, `parallel_tool_calls` beside a tools request,
 *  the hosted-common schema subset, `strict` caller-set only.
 *
 *  VERBOSITY RIDES `extraBody`. The OR provider models no verbosity option, but OR FORWARDS an
 *  unmodelled body field to the upstream — verified via `debug.echo_upstream_body`:
 *  `openai/gpt-5.4` with `extraBody: { verbosity: "low" }` produced an upstream Responses body carrying
 *  `text: { verbosity: "low" }`. The funnel has already gated it (`knobs.verbosity` is present only when the
 *  resolved capability advertises the level), so the old unconditional `verbosity_dropped` was a lie on
 *  every OR turn. */
function openRouterShape(req: OpenAiCompatChatRequest, turn: TurnKnobs, warnings: ResolvedWarning[], includeReasoning: boolean): TurnShape {
  const { connection } = req;
  const { knobs, sampling } = turn;
  const { routing, models } = openRouterExtras(connection, warnings);
  const strict = plannedStrict(turn.plan);
  const search = webSearchOptions(connection.extras, warnings);
  const debug = debugOptions(connection.extras, warnings);
  const compression =
    req.params.providerContextCompression === true
      ? { id: CONTEXT_COMPRESSION_PLUGIN, enabled: true, engine: MIDDLE_OUT_ENGINE }
      : { id: CONTEXT_COMPRESSION_PLUGIN, enabled: false };
  const providerOptions: SharedV4ProviderOptions = {
    [OPENROUTER_KEY]: {
      ...(includeReasoning && sendsOpenRouterReasoning(knobs.reasoning) ? { reasoning: openRouterReasoning(knobs.reasoning) } : {}),
      ...(models !== undefined ? { models: [...models] } : {}),
    },
  };
  return {
    options: {
      ...standardSampling(sampling.v4, includeReasoning ? knobs.maxOutputTokens : knobs.replayMaxOutputTokens),
      ...plannedOptions(turn.plan),
      providerOptions,
    },
    extraBody: {
      ...sampling.body,
      ...openRouterSession(req),
      ...(turn.automaticCache === null ? {} : { cache_control: { ...turn.automaticCache.directive } }),
      ...(knobs.verbosity !== undefined ? { verbosity: knobs.verbosity } : {}),
      ...(routing !== undefined ? { provider: routing } : {}),
      // The turn-owned compression entry MERGED with the user's declared plugins (validated against the
      // provider dist's own five-id union); `web_search_options` is the sibling knob for a model whose
      // search is native. Both ride `extraBody` beside `provider` because that is where this transport
      // already puts every OR body field the SDK models at the MODEL level — one home, one merge order.
      plugins: mergePlugins(compression, connection.extras, warnings),
      ...(search !== undefined ? { web_search_options: search } : {}),
      ...(debug !== undefined ? { debug } : {}),
    },
    openRouterChat: {
      ...(turn.parallelOff || turn.plan.parallelToolCalls === false ? { parallelToolCalls: false } : {}),
      ...(strict !== undefined ? { strict } : {}),
    },
  };
}

function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The effort the LAST attempt's options carried, read off the shape (never recomputed from the knobs):
 *  openrouter — `providerOptions.openrouter.reasoning.effort` (`"none"` when off; a budget or the mandatory
 *  replay carries no effort word ⇒ `null`); openai-compatible — the V4 `reasoning` word when the row spells
 *  `reasoning_effort`, `none` where the template kwarg alone spelled thinking off, else nothing was sent ⇒ `null`. A
 *  native route records what its own body carried: Ollama's `think` as sent, where `false` is off and `true` is on at
 *  no level. That is what was asked, not what ran. */
function appliedEffortOf(shape: TurnShape | undefined, dialect: Dialect, nativeBody: Readonly<Record<string, unknown>> | undefined): EffortLevel | null {
  if (nativeBody !== undefined) {
    const think = nativeBody[OLLAMA_THINK_KEY];
    return think === false ? REASONING_OFF : effortWordOf(think);
  }
  if (shape === undefined) {
    return null;
  }
  if (dialect === "openrouter") {
    const reasoning = shape.options.providerOptions?.[OPENROUTER_KEY]?.["reasoning"];
    return isJsonObject(reasoning) ? effortWordOf(reasoning["effort"]) : null;
  }
  return shape.templateOff === true ? REASONING_OFF : effortWordOf(shape.options.reasoning);
}

// ── the stream ────────────────────────────────────────────────────────────────────────────────────────────

interface StreamOnceArgs {
  readonly scheduleTimeout: ScheduleOp;
  readonly call: ModelCall;
  readonly options: LanguageModelV4CallOptions;
  readonly req: OpenAiCompatChatRequest;
  readonly label: string;
  readonly now: Clock;
  readonly markCommitted: () => void;
  readonly onFirstDelta: (at: number) => void;
  /** The response headers the V4 stream result exposes — before the first part, once per attempt. */
  readonly onResponse: (headers: SharedV4Headers | undefined) => void;
}

async function streamOnce(args: StreamOnceArgs): Promise<StreamDrain> {
  const { call, req, label, markCommitted } = args;
  const deltaTarget = req.chatId === undefined || req.onDelta === undefined ? undefined : { chatId: req.chatId, onDelta: req.onDelta };
  const idle = turnAbortSignal(req.signal, req.connection.features.requestTimeoutMs, args.scheduleTimeout);
  let first = true;
  const commit = (): void => {
    if (first) {
      first = false;
      args.onFirstDelta(args.now());
    }
    markCommitted();
  };
  try {
    const model = languageModelFor(call);
    const { stream, response } = await model.doStream({ ...args.options, abortSignal: idle.signal });
    args.onResponse(response?.headers);
    return await drainStream(stream, {
      label,
      // The SDK hands over a chunk's `error` object as the part's payload; it carries `message` as a refusal body does.
      errorWords: (payload) => refusalWords({ error: payload }, resolvedScrubSet(req.connection)),
      onPart: idle.reset,
      onText: (text): void => {
        commit();
        deltaTarget?.onDelta({ chatId: deltaTarget.chatId, kind: "text", text });
      },
      onReasoning: (text): void => {
        commit();
        deltaTarget?.onDelta({ chatId: deltaTarget.chatId, kind: "reasoning", text });
      },
    });
  } finally {
    idle.dispose();
  }
}

function rowOptionsFor(
  anthropicRoute: boolean,
  cachePlan: ExplicitCachePlan | null,
): ((row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined) | undefined {
  if (!anthropicRoute || cachePlan === null) {
    return;
  }
  return (row) => (row.wireMeta?.cacheBreakpoint === true ? { [OPENROUTER_KEY]: { cacheControl: { ...cachePlan.directive } } } : undefined);
}

/** The openrouter mandatory-reasoning strip-and-replay-once: an endpoint that rejects `effort:"none"` gets
 *  ONE replay with the reasoning block omitted, and the turn says so; every other failure propagates verbatim. */
async function drainWithReplay(
  run: (includeReasoning: boolean) => Promise<StreamDrain>,
  replayable: boolean,
  warnings: ResolvedWarning[],
): Promise<StreamDrain> {
  try {
    return await run(true);
  } catch (err) {
    if (replayable && isMandatoryReasoningRejection(err)) {
      warnings.push({ code: "reasoning_mandatory_clamp", message: MANDATORY_REPLAY_WARNING });
      return await run(false);
    }
    throw err;
  }
}

function prefixOptions(
  policy: CachePolicy,
  generation: GenerationCapability,
  anthropicRoute: boolean,
  chatId: OpenAiCompatChatRequest["chatId"],
): { readonly splitSystem: boolean; readonly body: Record<string, unknown> } {
  const implicit = implicitPromptCacheFields(policy, generation, chatId);
  const common = {
    ...(implicit.retention === null ? {} : { prompt_cache_retention: implicit.retention }),
    ...(implicit.key === null ? {} : { prompt_cache_key: implicit.key }),
  };
  if (implicit.breakpoint === null) {
    return { splitSystem: anthropicRoute, body: common };
  }
  return {
    splitSystem: policy.prefix.action === "markers",
    body: { ...common, prompt_cache_options: implicit.breakpoint },
  };
}

/** Runs one chat-completions turn — the only api this wire speaks (`WIRE_DEFS["openai-compat"].apis`). */
export async function runOpenAiCompatChatTurn(req: OpenAiCompatChatRequest, deps: OpenAiCompatChatDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} chat (${connection.model})`;
  const generation = requireGeneration(connection, label);
  const dialect = effectiveDialectOf(connection);
  const knobs = resolveChat(req.params, generation, { posture: req.posture, wire: connection.wire });
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  // What the answering ATTEMPT established (a box, not `let`s: both are assigned inside callbacks, and TypeScript
  // narrows a `let` read after an `await` to its initializer): the shape it was built with — the mandatory-reasoning
  // replay rebuilds it without the reasoning block, so the applied effort is read off THIS, never the first
  // attempt's intent — and the rate-limit snapshot off its response headers.
  const attempt: {
    shape: TurnShape | undefined;
    nativeBody: Readonly<Record<string, unknown>> | undefined;
    rateLimit: RateLimitSnapshot | null;
    responseCache: ResponseCache | undefined;
  } = {
    shape: undefined,
    nativeBody: undefined,
    rateLimit: null,
    responseCache: undefined,
  };
  const secrets = resolvedScrubSet(connection);
  const anthropicRoute = dialect === "openrouter" && isAnthropicModel(connection);
  const policy = resolveCachePolicy({
    context: cachePolicyContextOf(connection, dialect === "openrouter"),
    generation,
    preset: req.params.responseCache,
    request: req.responseCache,
    requestedDepth: req.cacheBreakpointDepth,
    requestedRoleHandling: req.params.advanced?.roleHandling,
  });
  warnings.push(...policy.warnings);
  const prefix = prefixOptions(policy.plan, generation, anthropicRoute, req.chatId);
  const cachePlan = explicitCachePlan(policy.plan);
  const automaticCache = automaticCachePlan(policy.plan);
  const plan = buildWirePlan({
    systemPrompt: req.systemPrompt,
    history: req.history,
    rowOptions: rowOptionsFor(anthropicRoute, cachePlan),
    splitSystem: prefix.splitSystem,
  });
  if (plan.toolResultErrorDropped) {
    warnings.push({ code: "tool_result_error_dropped", message: "tool-result isError ignored: the OpenAI-shaped chat wire has no tool-result error field" });
  }
  const cache = placeCache({ plan, req, cachePlan, generation, log, anthropicRoute, automaticCache });
  const prompt = withMessageOptions(plan.prompt, OPENROUTER_KEY, cache.patches);
  // Planned once per turn, never per attempt: a retry or the mandatory-reasoning replay must not warn twice.
  const structured = requireStructuredPlan(
    connection,
    {
      formats: req.responseFormat === undefined ? undefined : [req.responseFormat],
      tools: req.tools,
      toolChoice: req.toolChoice,
      reasoningOff: knobs.reasoning.offChosen === true,
    },
    label,
  );
  warnings.push(...structured.downgrades);
  const forbiddenIsNotCredentialVerdict = connection.features.forbiddenIsNotCredentialVerdict === true;
  const classify = (err: unknown): ProviderError => {
    // SECURITY: an error the stream drain already typed (an error frame's status) meets the same 403 rule as one from
    // before the stream, or a frame that only refuses the request would strike the stored key.
    if (err instanceof ProviderError) {
      return forbiddenAsRefusal({ error: err, classified: err, label, secrets, forbiddenIsNotCredentialVerdict });
    }
    const classified = withSchemaRejection(providerErrorFromHttp(err, label, secrets, deps.now), err, {
      log,
      model: connection.model,
      mode: structured.mode,
      secrets,
    });
    if (req.tools !== undefined && isJinjaToolsRefusal(err)) {
      return new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `${label}: ${JINJA_TOOLS_MESSAGE}`,
        ...(classified.apiErrorStatus !== undefined ? { apiErrorStatus: classified.apiErrorStatus } : {}),
        cause: classified,
      });
    }
    return templateRoleRefusal(err, label, classified) ?? forbiddenAsRefusal({ error: err, classified, label, secrets, forbiddenIsNotCredentialVerdict });
  };
  const retryOpts = {
    scheduleTimeout: deps.scheduleTimeout,
    signal: req.signal,
    now: deps.now,
    random: deps.random,
    ...(deps.addSpanEvent !== undefined ? { addSpanEvent: deps.addSpanEvent } : {}),
  };

  // A word-keyed logit bias resolves once per turn, from the cache where held (one tokenize call per new word).
  const sampling = await resolveWordBias({ sampling: knobs.sampling, connection, lexicon: deps.tokens, warnings, signal: req.signal });
  const turnKnobs: TurnKnobs = {
    automaticCache,
    knobs,
    sampling: wireSampling(sampling, connection.features, dialect, warnings),
    templateThinking: templateThinkingFor(req.params, generation, req.terminalToolsAttached === true, req.posture),
    plan: structured,
    parallelOff: disablesParallelToolCalls(req, structured, generation, warnings),
  };

  const reasoningEffort = knobs.reasoning.enabled ? knobs.reasoning.effort : undefined;
  // The one key derivation this wire writes `providerOptions` under and the compatible SDK files vendor metadata
  // under. The fold reads the same value back, so the bag cannot land under a spelling the reader never asks for.
  const providerMetadataKey = providerOptionsKey(connection.providerId);
  const onNativeBody = (body: Readonly<Record<string, unknown>>): void => {
    attempt.nativeBody = body;
  };
  const run = (includeReasoning: boolean): Promise<StreamDrain> =>
    runWithPreCommitRetry(
      (markCommitted) => {
        const shape =
          dialect === "openrouter"
            ? openRouterShape(req, turnKnobs, warnings, includeReasoning)
            : openAiCompatibleShape(req, turnKnobs, warnings, providerMetadataKey);
        attempt.shape = shape;
        // The beta-route decision; the route is the stamping gate's superset, so a turn that routes to `/beta`
        // without stamping is harmless and a stamp never rides prod where the vendor 400s it.
        const prefillAllowed = acceptsAssistantPrefill(generation) && req.tools === undefined;
        const betaRoute = betaRouteNeeded(connection.features.prefill, prefillAllowed, plan.endsOnAssistant, structured.tools);
        const call: ModelCall = {
          cachePolicy: policy.plan,
          responseCache: req.responseCache,
          responseCacheSettings: req.params.responseCache,
          connection,
          deps: deps.transport,
          label,
          api: req.api,
          chatId: req.chatId,
          plan,
          prefillAllowed,
          prefillReasoning: req.prefillReasoning,
          requiresBetaRoute: betaRoute,
          templateThinking: turnKnobs.templateThinking,
          templatePreserveReasoning: knobs.carryReasoning === "off" ? false : undefined,
          reasoningEffort,
          onNativeBody,
          foldSameRole: policy.plan.prefix.preservesBlockEnds,
          replyImages: knobs.replyImages,
          ...(generation.imageDetail === true ? { imageDetail: req.attachmentQuality?.imageDetail ?? DEFAULT_ATTACHMENT_QUALITY.imageDetail } : {}),
          warnings,
          extraBody: {
            ...shape.extraBody,
            ...prefix.body,
          },
          cacheMarkers: cache.patches,
          openRouterChat: shape.openRouterChat,
          ...(req.reasoningTags !== undefined ? { reasoningTags: req.reasoningTags } : {}),
        };
        return streamOnce({
          scheduleTimeout: deps.scheduleTimeout,
          call,
          options: { ...shape.options, prompt },
          req,
          label,
          now: deps.now,
          markCommitted,
          onFirstDelta: (at) => {
            firstDeltaAt = at;
          },
          onResponse: (headers) => {
            attempt.rateLimit = rateLimitFromHeaders(headers, deps.now());
            attempt.responseCache = dialect === "openrouter" ? responseCacheOf(headers, secrets) : undefined;
          },
        });
      },
      classify,
      retryOpts,
    );

  // THE TYPED-FAILURE BOUNDARY. `runWithPreCommitRetry` re-throws the ORIGINAL error on purpose (its JSDoc
  // states it: the classification is only the retry policy's input, and the openai-compat replay below peels
  // `responseBody`/`cause` off that raw object, which `providerErrorFromHttp` would have scrubbed away). But
  // every streaming-chat failure then escapes the package RAW, breaking the one thing `contract/errors.ts`
  // promises: "ONE error class across every task so a consumer catches a single type regardless of which
  // backend threw". A cancelled turn surfaces a bare `DOMException: AbortError` here while the agent-sdk and
  // local-light wires surface `ProviderError{kind:"aborted"}`, and `entry/compose/chat.ts` hands the rejection
  // straight on without normalising. So the classify happens HERE, outside everything that needs the raw
  // error and inside nothing that does. `classify` returns an existing `ProviderError` untouched.
  const drain = await drainWithReplay(run, dialect === "openrouter" && knobs.reasoning.offChosen === true, warnings).catch((err: unknown): never => {
    throw classify(err);
  });
  // The SDK's OWN drops, folded into the same array as the funnel's before the result is built.
  warnings.push(...sdkWarnings(drain.warnings));
  const finishedAt = deps.now();
  const folded = toChatResult(drain, {
    model: connection.model,
    providerId: connection.providerId,
    providerMetadataKey,
    generation,
    maxOutputTokens: knobs.maxOutputTokens,
    startedAt,
    firstDeltaAt,
    now: finishedAt,
    measuredCost: measuredCostOf(drain.providerMetadata, drain.usage?.raw),
    responseCache: attempt.responseCache,
    pricing: connection.features.pricing,
    // The provider's response id: OpenRouter's `gen-…` (the cost-settlement key) or an endpoint's own
    // `chatcmpl-…` — both opaque provenance on the row.
    generationId: drain.responseId ?? null,
    appliedEffort: appliedEffortOf(attempt.shape, dialect, attempt.nativeBody),
    rateLimit: attempt.rateLimit,
    warnings,
  });
  const canary = rateLimitCanaryEvent(attempt.rateLimit, finishedAt);
  await observeChatResult(req, folded);
  const turn: ChatResult = structuredChatResult(canary === null ? folded : { ...folded, events: [...folded.events, canary] }, structured);
  if (attempt.rateLimit !== null) {
    log.emit(attempt.rateLimit.status === "allowed" ? "debug" : "warn", "provider.rate_limit", { turnId: knobs.turnId, ...attempt.rateLimit });
  }
  // The receipt's gate is the PLACEMENT, not the dialect: `placeCache` runs for every dialect whose
  // resolved plan says markers (curated openai rows spell `prompt_cache_breakpoint` themselves; OpenRouter
  // rides the SDK's `cache_control` path), so the OR-dialect gate once hid this line from exactly the rows
  // the curator marked explicit-cache while the span below reported their breakpoints.
  const breakpointsPlaced = cache.written.systemBlocks + cache.written.historyDepths.length + cache.written.requestBlocks;
  emitTurnReceipts({
    log,
    knobs,
    generation,
    api: req.api,
    providerId: req.connection.providerId,
    requestedModel: req.connection.model,
    requestedParams: { ...req.params },
    usage: turn.usage,
    warnings,
    ...(breakpointsPlaced > 0
      ? {
          cache: {
            breakpointsPlaced,
            breakpointOffsets: cache.written.historyDepths,
          },
        }
      : {}),
    ...(knobs.verbosity !== undefined ? { sentVerbosity: knobs.verbosity } : {}),
  });
  // The turn's timeline, same three events as the direct wire (the trace must read the same on both).
  emitTurnSpanEvents({
    addSpanEvent: deps.addSpanEvent,
    turnId: knobs.turnId,
    model: connection.model,
    startedAt,
    firstDeltaAt,
    turn,
    cache: {
      breakpointsPlaced,
      readTokens: turn.usage.cacheReadTokens,
      writeTokens: turn.usage.cacheWriteTokens,
    },
  });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}

export type { OpenAiCompatChatDeps } from "#src/contract/openai-backend.ts";
