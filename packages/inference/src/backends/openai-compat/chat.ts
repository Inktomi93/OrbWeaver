// ONE chat turn on the openai-compat wire over a V4 `doStream` (§8.1). The turn: the funnel resolves the
// knobs ONCE (`resolveChat`), the shared prompt builder lays out the wire plan, the placer decides the cache
// breakpoints (openrouter on an Anthropic route), the dialect's option builder spells what the SDK models
// natively, the transport's hooks shape the rest of the body, the shared reducer drains the stream, and the
// result mapper folds usage/cost/finish onto the one `ChatResult` record. Pre-commit retry + the
// openrouter mandatory-reasoning strip-and-replay-once ride `runWithPreCommitRetry`; every degrade is a
// `warning` event (D41).

import type { JSONObject, LanguageModelV4CallOptions, SharedV4Headers, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { Dialect, GenerationCapability } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, cacheMinTokensOf, scrubWireSchema } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import { errorMessage } from "@orb/kit/error-message";
import type { JsonValue } from "@orb/kit/json";
import { estimateTokens } from "@orb/kit/tokens";
import { z } from "zod";
import type { ChatHistoryMessage, ChatResult, OpenAiCompatChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { RateLimitSnapshot } from "../../contract/events.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import { effortWordOf } from "../kit/applied-effort.ts";
import type { CacheBreakpointRow, OpenRouterRouting } from "../kit/cache-control.ts";
import { ANTHROPIC_CACHE_1H, computeCacheBreakpointPlacements, effectiveProviderRouting, isAnthropicModel } from "../kit/cache-control.ts";
import { extractHttpErrorDiagnostic, providerErrorFromHttp } from "../kit/error-classify.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import type { ProviderLogger } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { rateLimitCanaryEvent, rateLimitFromHeaders } from "../kit/rate-limit-headers.ts";
import { runWithPreCommitRetry } from "../kit/retry.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../kit/sanitize.ts";
import { emitTurnSpanEvents } from "../kit/turn-span.ts";
import { functionTools, jsonResponseFormat, samplingExtras, servableToolChoice, standardSampling, toolChoiceOf, wireEffortOf } from "../v4/options.ts";
import type { WirePlan } from "../v4/prompt.ts";
import { buildWirePlan, withMessageOptions } from "../v4/prompt.ts";
import { appliedSampling, DROPPED_SAMPLING_CODES, measuredCostOf, sdkWarnings, toChatResult } from "../v4/result.ts";
import type { StreamDrain } from "../v4/stream.ts";
import { drainStream } from "../v4/stream.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { languageModelFor, providerOptionsKey } from "./model.ts";

const MANDATORY_REASONING_RE = /reasoning is mandatory/iu;
const CONTEXT_COMPRESSION_PLUGIN = "context-compression";
const MIDDLE_OUT_ENGINE = "middle-out";
const OPENROUTER_KEY = "openrouter";
const REASONING_OFF = "none";

export interface OpenAiCompatChatDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly log: InferenceLog;
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly transport: TransportDeps;
}

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
  .partial();

function requireGeneration(connection: Resolved, label: string): GenerationCapability {
  if (connection.capability.kind !== "generation") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the connection's model is a ${connection.capability.kind} model, not a generation model`,
    });
  }
  return connection.capability.generation;
}

// True when the upstream 400 is a mandatory-reasoning endpoint rejecting `reasoning.effort:"none"` — the
// openrouter strip-and-replay-once recovery. The peeled strings never leave this function (no scrub sink).
function isMandatoryReasoningRejection(error: unknown): boolean {
  const diag = extractHttpErrorDiagnostic(error, NO_PROVIDER_SECRETS);
  return MANDATORY_REASONING_RE.test(`${diag.body ?? ""} ${diag.cause ?? ""} ${errorMessage(error)}`);
}

// ── cache placement (openrouter × Anthropic route) ────────────────────────────────────────────────────────

interface CacheWriteReceipt {
  readonly historyDepths: readonly number[];
  readonly systemBlocks: number;
}

interface CachePlacement {
  readonly patches: Map<number, Record<string, unknown>>;
  readonly written: CacheWriteReceipt;
}

const NO_CACHE_PLACEMENT: CachePlacement = { patches: new Map(), written: { historyDepths: [], systemBlocks: 0 } };

function placeCache(args: {
  readonly plan: WirePlan;
  readonly req: OpenAiCompatChatRequest;
  readonly generation: GenerationCapability;
  readonly log: ProviderLogger;
  readonly anthropicRoute: boolean;
}): CachePlacement {
  const { plan, req, generation, log } = args;
  if (!args.anthropicRoute) {
    return NO_CACHE_PLACEMENT;
  }
  const patches = new Map<number, Record<string, unknown>>();
  const staticText = req.systemPrompt.static.trim();
  let systemBlocks = 0;
  if (staticText.length > 0 && plan.rows[0]?.role === "system") {
    patches.set(0, { cacheControl: { ...ANTHROPIC_CACHE_1H } });
    systemBlocks = 1;
  }
  const historyDepths: number[] = [];
  if (req.cacheBreakpointDepth !== undefined && generation.turns?.explicitPromptCache === true) {
    const rows: CacheBreakpointRow[] = plan.rows.map((row) => ({ role: row.role, toolExchange: row.toolExchange, tokens: estimateTokens(row.text) }));
    const placements = computeCacheBreakpointPlacements({
      rows,
      systemStaticTokens: estimateTokens(staticText),
      depthFromEnd: req.cacheBreakpointDepth,
      cacheMinTokens: cacheMinTokensOf(generation),
      log,
    });
    for (const { index, depth } of placements) {
      patches.set(index, { cacheControl: { ...ANTHROPIC_CACHE_1H } });
      historyDepths.push(depth);
    }
  }
  return { patches, written: { historyDepths, systemBlocks } };
}

// ── the per-dialect option builders ───────────────────────────────────────────────────────────────────────

interface TurnShape {
  readonly options: Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal">;
  readonly extraBody: Record<string, unknown>;
  readonly openRouterChat?: ModelCall["openRouterChat"];
}

function openRouterReasoning(reasoning: ResolvedReasoning): JSONObject {
  if (!reasoning.enabled) {
    return { effort: REASONING_OFF };
  }
  if (reasoning.budgetTokens !== undefined) {
    return { max_tokens: reasoning.budgetTokens };
  }
  // `max` rides verbatim only where it was measured: on the adaptive (Claude) rows OpenRouter forwards it upstream
  // as `output_config.effort: "max"` (gen-1790144375-ED228ncR3pymYMrZ25L3). Every other model keeps the V4 mapping
  // it always had (`max` → `xhigh`), because a catalog with no allowlist folds to every level and cannot prove
  // the upstream takes `max`.
  if (reasoning.effort === undefined) {
    return { effort: "high" };
  }
  return { effort: reasoning.mode === "adaptive" ? reasoning.effort : wireEffortOf(reasoning.effort) };
}

/** The openai-compatible transport: effort rides V4 `reasoning` iff the row spells `reasoning_effort`; a
 *  budget has no slot; verbosity rides the SDK's `textVerbosity` option; the unmodelled sampler knobs ride
 *  `providerOptions[name]`, which the SDK spreads into the body. */
function openAiCompatibleShape(req: OpenAiCompatChatRequest, knobs: ResolvedChatKnobs, warnings: ResolvedWarning[], key: string): TurnShape {
  const { connection } = req;
  const reasoning = knobs.reasoning;
  const spellsEffort = connection.features.effort === "reasoning_effort";
  const effort = reasoning.enabled && reasoning.effort !== undefined && spellsEffort ? wireEffortOf(reasoning.effort) : undefined;
  if (reasoning.enabled && reasoning.budgetTokens !== undefined) {
    warnings.push({
      code: "sampling_knob_dropped",
      knob: "thinkingBudgetTokens",
      message: "thinkingBudgetTokens ignored: the OpenAI-compatible chat-completions wire has no reasoning-budget field",
    });
  }
  if (reasoning.enabled && reasoning.effort !== undefined && !spellsEffort) {
    warnings.push({ code: "effort_dropped", message: "effort ignored: this endpoint's row spells no reasoning-effort field" });
  }
  const providerOptions: SharedV4ProviderOptions = {
    [key]: {
      ...samplingExtras(knobs.sampling),
      ...(knobs.verbosity !== undefined ? { textVerbosity: knobs.verbosity } : {}),
      ...(connection.features.strictJson === "default-on" ? { strictJsonSchema: req.responseFormat?.strict ?? true } : {}),
      ...(connection.features.strictJson === "declared-only" ? { strictJsonSchema: req.responseFormat?.strict ?? false } : {}),
    },
  };
  return {
    options: {
      ...standardSampling(knobs.sampling, knobs.maxOutputTokens),
      ...(effort !== undefined ? { reasoning: effort } : {}),
      ...(req.tools !== undefined ? { tools: functionTools(req.tools, { strictJson: connection.features.strictJson, warnings }) } : {}),
      ...(req.toolChoice !== undefined ? { toolChoice: toolChoiceOf(req.toolChoice) } : {}),
      ...(req.responseFormat !== undefined ? { responseFormat: jsonResponseFormat(req.responseFormat, req.responseFormat.schema) } : {}),
      providerOptions,
    },
    extraBody: {},
  };
}

/** THE OPENROUTER PLUGIN UNION (audit C3), validated against the 3.0.0 dist's own shape
 *  (`OpenRouterChatSettings.plugins`, `index.d.ts:98-131`) — five ids, each with its own fields. Spelled here
 *  because this file is the ONE reader of `extras` on this transport; a malformed entry drops loudly and is
 *  never sent. `response-healing` is the reason this door is worth opening: it is OpenRouter's server-side
 *  repair for the malformed JSON our non-streaming structured task otherwise has to re-ask for. */
const openRouterPluginSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("web"), max_results: z.number().int().positive().optional(), search_prompt: z.string().optional(), engine: z.string().optional() }),
  z.object({ id: z.literal("file-parser"), max_files: z.number().int().positive().optional(), pdf: z.object({ engine: z.string().optional() }).optional() }),
  z.object({ id: z.literal("moderation") }),
  z.object({ id: z.literal("response-healing") }),
  z.object({ id: z.literal("auto-router"), allowed_models: z.array(z.string()).optional() }),
]);

/** OR's request DEBUG block (`debug`, `index.d.ts:174-185`) — the audit's D3 door. `echo_upstream_body`
 *  makes OpenRouter return, as the FIRST SSE frame, the body it actually sent upstream after routing and
 *  caching: the only way to see what a routed provider received rather than what we asked OR for. It is a
 *  REQUEST BODY field and its payload rides the ordinary stream, so the wire capture's own reply tap
 *  (`WIRE_CAPTURE_REPLY`, `backends/v4/fetch.ts` control 4b) is what surfaces it — the SDK's
 *  `includeRawChunks` is NOT involved, and deliberately not taken (that file's header records why).
 *  Streaming-only per the dist's own note; a non-streaming call simply gets nothing back. */
const openRouterDebugSchema = z.object({ echo_upstream_body: z.boolean().optional() });

/** OR's built-in web-search options (`web_search_options`, `index.d.ts:134-153`) — a sibling of the `web`
 *  plugin, not a duplicate of it: the plugin ADDS search to a model that has none, these options configure a
 *  model whose own search is native. */
const openRouterWebSearchSchema = z.object({
  max_results: z.number().int().positive().optional(),
  search_prompt: z.string().optional(),
  engine: z.string().optional(),
});

/** THE PLUGIN MERGE (audit C3): the turn-owned context-compression entry FIRST, then the user's declared
 *  plugins. Order is the precedence, and compression leads on purpose — it is the one plugin whose value
 *  this layer decides (off `params.providerContextCompression`), so a user entry re-declaring
 *  `context-compression` must not silently take the turn's decision away. Such an entry is dropped with the
 *  belt's own `custom_parameters_ignored` code: MODELLED WINS (D143(b)/D156), exactly as on the body. */
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
  return parsed.data as JSONObject;
}

/** `debug` off `extras`, validated; a malformed block drops loudly and is never sent (D3). */
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
  return parsed.data as JSONObject;
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

/** The openrouter transport: reasoning nested under `providerOptions.openrouter`, routing + the fallback
 *  chain off `extras`, the managed context-compression plugin, `parallel_tool_calls` beside a tools request,
 *  the hosted-common schema subset, `strict` caller-set only (STRICTFMT).
 *
 *  VERBOSITY RIDES `extraBody` (§H1(b)). The OR provider models no verbosity option, but OR FORWARDS an
 *  unmodelled body field to the upstream — MEASURED 2026-09-19 via `debug.echo_upstream_body`:
 *  `openai/gpt-5.4` with `extraBody: { verbosity: "low" }` produced an upstream Responses body carrying
 *  `text: { verbosity: "low" }`. The funnel has already gated it (`knobs.verbosity` is present only when the
 *  resolved capability advertises the level), so the old unconditional `verbosity_dropped` was a lie on
 *  every OR turn. */
function openRouterShape(req: OpenAiCompatChatRequest, knobs: ResolvedChatKnobs, warnings: ResolvedWarning[], includeReasoning: boolean): TurnShape {
  const { connection } = req;
  const { routing, models } = openRouterExtras(connection, warnings);
  const search = webSearchOptions(connection.extras, warnings);
  const debug = debugOptions(connection.extras, warnings);
  const parallel = req.params.advanced?.parallelToolCalls;
  const compression =
    req.params.providerContextCompression === true
      ? { id: CONTEXT_COMPRESSION_PLUGIN, enabled: true, engine: MIDDLE_OUT_ENGINE }
      : { id: CONTEXT_COMPRESSION_PLUGIN, enabled: false };
  const providerOptions: SharedV4ProviderOptions = {
    [OPENROUTER_KEY]: {
      ...(includeReasoning ? { reasoning: openRouterReasoning(knobs.reasoning) } : {}),
      ...(models !== undefined ? { models: [...models] } : {}),
    },
  };
  return {
    options: {
      ...standardSampling(knobs.sampling, knobs.maxOutputTokens),
      ...(req.tools !== undefined ? { tools: functionTools(req.tools, { strictJson: connection.features.strictJson, warnings }) } : {}),
      ...(req.toolChoice !== undefined ? { toolChoice: toolChoiceOf(req.toolChoice) } : {}),
      ...(req.responseFormat !== undefined
        ? { responseFormat: jsonResponseFormat(req.responseFormat, scrubWireSchema(req.responseFormat.schema, "hosted-common").schema) }
        : {}),
      providerOptions,
    },
    extraBody: {
      ...samplingExtras(knobs.sampling),
      ...(knobs.verbosity !== undefined ? { verbosity: knobs.verbosity } : {}),
      ...(routing !== undefined ? { provider: routing } : {}),
      // C3: the turn-owned compression entry MERGED with the user's declared plugins (validated against the
      // provider dist's own five-id union); `web_search_options` is the sibling knob for a model whose
      // search is native. Both ride `extraBody` beside `provider` because that is where this transport
      // already puts every OR body field the SDK models at the MODEL level — one home, one merge order.
      plugins: mergePlugins(compression, connection.extras, warnings),
      ...(search !== undefined ? { web_search_options: search } : {}),
      ...(debug !== undefined ? { debug } : {}),
    },
    openRouterChat: {
      ...(req.tools !== undefined && parallel !== undefined ? { parallelToolCalls: parallel } : {}),
      ...(req.responseFormat?.strict !== undefined ? { strict: req.responseFormat.strict } : {}),
    },
  };
}

function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** B1: the effort the LAST attempt's options carried, read off the shape (never recomputed from the knobs):
 *  openrouter — `providerOptions.openrouter.reasoning.effort` (`"none"` when off; a budget or the mandatory
 *  replay carries no effort word ⇒ `null`); openai-compatible — the V4 `reasoning` word when the row spells
 *  `reasoning_effort`, else nothing was sent ⇒ `null`. */
function appliedEffortOf(shape: TurnShape | undefined, dialect: Dialect): EffortLevel | null {
  if (shape === undefined) {
    return null;
  }
  if (dialect === "openrouter") {
    const reasoning = shape.options.providerOptions?.[OPENROUTER_KEY]?.["reasoning"];
    return isJsonObject(reasoning) ? effortWordOf(reasoning["effort"]) : null;
  }
  return effortWordOf(shape.options.reasoning);
}

// ── the stream ────────────────────────────────────────────────────────────────────────────────────────────

interface StreamOnceArgs {
  readonly call: ModelCall;
  readonly options: LanguageModelV4CallOptions;
  readonly req: OpenAiCompatChatRequest;
  readonly label: string;
  readonly now: () => number;
  readonly markCommitted: () => void;
  readonly onFirstDelta: (at: number) => void;
  /** The response headers the V4 stream result exposes (B6) — before the first part, once per attempt. */
  readonly onResponse: (headers: SharedV4Headers | undefined) => void;
}

async function streamOnce(args: StreamOnceArgs): Promise<StreamDrain> {
  const { call, req, label, markCommitted } = args;
  const deltaTarget = req.chatId === undefined || req.onDelta === undefined ? undefined : { chatId: req.chatId, onDelta: req.onDelta };
  const idle = turnAbortSignal(req.signal);
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

// ── receipts ──────────────────────────────────────────────────────────────────────────────────────────────

function emitReceipts(args: {
  readonly log: ProviderLogger;
  readonly req: OpenAiCompatChatRequest;
  readonly generation: GenerationCapability;
  readonly knobs: ResolvedChatKnobs;
  readonly turn: ChatResult;
  readonly written: CacheWriteReceipt;
  readonly warnings: readonly ResolvedWarning[];
}): void {
  const { log, req, generation, knobs, turn, written, warnings } = args;
  if (generation.turns?.explicitPromptCache === true && req.connection.provider.dialect === "openrouter") {
    const total = turn.usage.cacheReadTokens + turn.usage.cacheWriteTokens;
    log.cache({
      turnId: knobs.turnId,
      cacheReadTokens: turn.usage.cacheReadTokens,
      cacheWriteTokens: turn.usage.cacheWriteTokens,
      breakpointsPlaced: written.systemBlocks + written.historyDepths.length,
      breakpointOffsets: written.historyDepths,
      hitRatio: total > 0 ? turn.usage.cacheReadTokens / total : 0,
      minCacheTokens: cacheMinTokensOf(generation),
    });
  }
  log.capability({
    turnId: knobs.turnId,
    api: req.api,
    providerId: req.connection.providerId,
    requestedModel: req.connection.model,
    turns: { ...generation.turns },
    droppedWarnings: warnings.map((w) => ({ code: w.code, message: w.message })),
  });
  log.sampling({
    turnId: knobs.turnId,
    requested: { ...req.params },
    applied: { ...appliedSampling(knobs.sampling, warnings), ...(knobs.verbosity !== undefined ? { verbosity: knobs.verbosity } : {}) },
    dropped: warnings.filter((w) => DROPPED_SAMPLING_CODES.has(w.code)).map((w) => ({ knob: w.knob ?? w.code, reason: w.message })),
  });
}

function rowOptionsFor(dialect: Dialect): ((row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined) | undefined {
  if (dialect !== "openrouter") {
    return;
  }
  return (row) => (row.wireMeta?.cacheBreakpoint === true ? { [OPENROUTER_KEY]: { cacheControl: { ...ANTHROPIC_CACHE_1H } } } : undefined);
}

/** The openrouter mandatory-reasoning strip-and-replay-once: an endpoint that rejects `effort:"none"` gets
 *  ONE replay with the reasoning block omitted; every other failure propagates verbatim. */
async function drainWithReplay(run: (includeReasoning: boolean) => Promise<StreamDrain>, replayable: boolean): Promise<StreamDrain> {
  try {
    return await run(true);
  } catch (err) {
    if (replayable && isMandatoryReasoningRejection(err)) {
      return await run(false);
    }
    throw err;
  }
}

/** Runs one chat-completions turn — the only api this wire speaks (`WIRE_DEFS["openai-compat"].apis`). */
export async function runOpenAiCompatChatTurn(req: OpenAiCompatChatRequest, deps: OpenAiCompatChatDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} chat (${connection.model})`;
  const generation = requireGeneration(connection, label);
  const dialect = connection.provider.dialect ?? "openai-compatible";
  const knobs = resolveChat(req.params, generation);
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  // What the answering ATTEMPT established (a box, not `let`s: both are assigned inside callbacks, and TypeScript
  // narrows a `let` read after an `await` to its initializer): the shape it was built with — the mandatory-reasoning
  // replay rebuilds it without the reasoning block, so the applied effort is read off THIS, never the first
  // attempt's intent — and the rate-limit snapshot off its response headers.
  const attempt: { shape: TurnShape | undefined; rateLimit: RateLimitSnapshot | null } = { shape: undefined, rateLimit: null };
  const secrets = resolvedScrubSet(connection);
  const anthropicRoute = dialect === "openrouter" && isAnthropicModel(connection);
  const plan = buildWirePlan({
    systemPrompt: req.systemPrompt,
    history: req.history,
    rowOptions: rowOptionsFor(dialect),
    splitSystem: anthropicRoute,
  });
  if (plan.toolResultErrorDropped) {
    warnings.push({ code: "tool_result_error_dropped", message: "tool-result isError ignored: the OpenAI-shaped chat wire has no tool-result error field" });
  }
  const cache = placeCache({ plan, req, generation, log, anthropicRoute });
  const prompt = withMessageOptions(plan.prompt, OPENROUTER_KEY, cache.patches);
  const classify = (err: unknown): ProviderError => (err instanceof ProviderError ? err : providerErrorFromHttp(err, label, secrets));
  const retryOpts = {
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
    ...(deps.addSpanEvent !== undefined ? { addSpanEvent: deps.addSpanEvent } : {}),
  };

  // Resolved once per turn, not per attempt: a retry or the mandatory-reasoning replay must not warn twice.
  const wireReq: OpenAiCompatChatRequest =
    req.toolChoice === undefined ? req : { ...req, toolChoice: servableToolChoice(req.toolChoice, generation, warnings) };

  const run = (includeReasoning: boolean): Promise<StreamDrain> =>
    runWithPreCommitRetry(
      (markCommitted) => {
        const shape =
          dialect === "openrouter"
            ? openRouterShape(wireReq, knobs, warnings, includeReasoning)
            : openAiCompatibleShape(wireReq, knobs, warnings, providerOptionsKey(connection.providerId));
        attempt.shape = shape;
        const call: ModelCall = {
          connection,
          deps: deps.transport,
          label,
          api: req.api,
          chatId: req.chatId,
          plan,
          prefillAllowed: acceptsAssistantPrefill(generation) && req.tools === undefined,
          replyImages: knobs.replyImages,
          warnings,
          extraBody: shape.extraBody,
          openRouterChat: shape.openRouterChat,
          ...(req.reasoningTags !== undefined ? { reasoningTags: req.reasoningTags } : {}),
        };
        return streamOnce({
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
          },
        });
      },
      classify,
      retryOpts,
    );

  // THE TYPED-FAILURE BOUNDARY. `runWithPreCommitRetry` re-throws the ORIGINAL error on purpose (its JSDoc
  // states it: the classification is only the retry policy's input, and the openai-compat replay below peels
  // `responseBody`/`cause` off that raw object, which `providerErrorFromHttp` would have scrubbed away). That
  // ruling stands — but it left every streaming-chat failure escaping the package RAW, breaking the one thing
  // `contract/errors.ts` promises: "ONE error class across every task so a consumer catches a single type
  // regardless of which backend threw". Measured 2026-09-20 by the cross-backend conformance suite: a
  // cancelled turn surfaced a bare `DOMException: AbortError` here while the agent-sdk and local-light wires
  // surfaced `ProviderError{kind:"aborted"}`, and `entry/compose/chat.ts` hands the rejection straight on
  // without normalising. So the classify happens HERE, outside everything that needs the raw error and
  // inside nothing that does. `classify` returns an existing `ProviderError` untouched.
  const drain = await drainWithReplay(run, dialect === "openrouter" && !knobs.reasoning.enabled).catch((err: unknown): never => {
    throw classify(err);
  });
  // The SDK's OWN drops (§A3), folded into the same array as the funnel's before the result is built.
  warnings.push(...sdkWarnings(drain.warnings));
  const finishedAt = deps.now();
  const folded = toChatResult(drain, {
    model: connection.model,
    providerId: connection.providerId,
    generation,
    maxOutputTokens: knobs.maxOutputTokens,
    startedAt,
    firstDeltaAt,
    now: finishedAt,
    measuredCost: measuredCostOf(drain.providerMetadata, drain.usage?.raw),
    pricing: connection.features.pricing,
    // The provider's response id (B7): OpenRouter's `gen-…` (the cost-settlement key) or an endpoint's own
    // `chatcmpl-…` — both opaque provenance on the row.
    generationId: drain.responseId ?? null,
    appliedEffort: appliedEffortOf(attempt.shape, dialect),
    rateLimit: attempt.rateLimit,
    warnings,
  });
  const canary = rateLimitCanaryEvent(attempt.rateLimit, finishedAt);
  const turn: ChatResult = canary === null ? folded : { ...folded, events: [...folded.events, canary] };
  if (attempt.rateLimit !== null) {
    log.emit(attempt.rateLimit.status === "allowed" ? "debug" : "warn", "provider.rate_limit", { turnId: knobs.turnId, ...attempt.rateLimit });
  }
  emitReceipts({ log, req, generation, knobs, turn, written: cache.written, warnings });
  // D4: the turn's timeline, same three events as the direct wire (the trace must read the same on both).
  emitTurnSpanEvents({
    addSpanEvent: deps.addSpanEvent,
    turnId: knobs.turnId,
    model: connection.model,
    startedAt,
    firstDeltaAt,
    turn,
    cache: {
      breakpointsPlaced: cache.written.systemBlocks + cache.written.historyDepths.length,
      readTokens: turn.usage.cacheReadTokens,
      writeTokens: turn.usage.cacheWriteTokens,
    },
  });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}
