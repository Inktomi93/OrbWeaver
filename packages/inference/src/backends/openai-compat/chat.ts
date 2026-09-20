// ONE chat turn on the openai-compat wire over a V4 `doStream` (§8.1). The turn: the funnel resolves the
// knobs ONCE (`resolveChat`), the shared prompt builder lays out the wire plan, the placer decides the cache
// breakpoints (openrouter on an Anthropic route), the dialect's option builder spells what the SDK models
// natively, the transport's hooks shape the rest of the body, the shared reducer drains the stream, and the
// result mapper folds usage/cost/finish onto the one `ChatResult` record. Pre-commit retry + the
// openrouter mandatory-reasoning strip-and-replay-once ride `runWithPreCommitRetry`; every degrade is a
// `warning` event (D41).

import type { JSONObject, LanguageModelV4CallOptions, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { Dialect, GenerationCapability } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, cacheMinTokensOf } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { scrubWireSchema } from "@orb/kit/json-schema";
import { estimateTokens } from "@orb/kit/tokens";
import { z } from "zod";
import type { ChatHistoryMessage, ChatResult, OpenAiCompatChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import type { CacheBreakpointRow, OpenRouterRouting } from "../kit/cache-control.ts";
import { ANTHROPIC_CACHE_1H, computeCacheBreakpointPlacements, effectiveProviderRouting, isAnthropicModel } from "../kit/cache-control.ts";
import { extractHttpErrorDiagnostic, providerErrorFromHttp } from "../kit/error-classify.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import type { ProviderLogger } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import type { AddSpanEvent } from "../kit/retry.ts";
import { runWithPreCommitRetry } from "../kit/retry.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../kit/sanitize.ts";
import { functionTools, jsonResponseFormat, samplingExtras, standardSampling, toolChoiceOf, wireEffortOf } from "../v4/options.ts";
import type { WirePlan } from "../v4/prompt.ts";
import { buildWirePlan, withMessageOptions } from "../v4/prompt.ts";
import { measuredCostOf, toChatResult } from "../v4/result.ts";
import type { StreamDrain } from "../v4/stream.ts";
import { drainStream } from "../v4/stream.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { languageModelFor } from "./model.ts";

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
  return { effort: reasoning.effort !== undefined ? wireEffortOf(reasoning.effort) : "high" };
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
      ...(req.tools !== undefined ? { tools: functionTools(req.tools) } : {}),
      ...(req.toolChoice !== undefined ? { toolChoice: toolChoiceOf(req.toolChoice) } : {}),
      ...(req.responseFormat !== undefined ? { responseFormat: jsonResponseFormat(req.responseFormat, req.responseFormat.schema) } : {}),
      providerOptions,
    },
    extraBody: {},
  };
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
    routing: effectiveProviderRouting(connection.model, parsedRouting?.success === true ? parsedRouting.data : undefined),
    models: parsedModels?.success === true ? parsedModels.data : undefined,
  };
}

/** The openrouter transport: reasoning nested under `providerOptions.openrouter`, routing + the fallback
 *  chain off `extras`, the managed context-compression plugin, `parallel_tool_calls` beside a tools request,
 *  the hosted-common schema subset, `strict` caller-set only (STRICTFMT). Verbosity has no slot. */
function openRouterShape(req: OpenAiCompatChatRequest, knobs: ResolvedChatKnobs, warnings: ResolvedWarning[], includeReasoning: boolean): TurnShape {
  const { connection } = req;
  if (knobs.verbosity !== undefined) {
    warnings.push({ code: "verbosity_dropped", message: "verbosity ignored: the openrouter chat-completions wire has no verbosity field" });
  }
  const { routing, models } = openRouterExtras(connection, warnings);
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
      ...(req.tools !== undefined ? { tools: functionTools(req.tools) } : {}),
      ...(req.toolChoice !== undefined ? { toolChoice: toolChoiceOf(req.toolChoice) } : {}),
      ...(req.responseFormat !== undefined
        ? { responseFormat: jsonResponseFormat(req.responseFormat, scrubWireSchema(req.responseFormat.schema, "hosted-common").schema) }
        : {}),
      providerOptions,
    },
    extraBody: {
      ...samplingExtras(knobs.sampling),
      ...(routing !== undefined ? { provider: routing } : {}),
      plugins: [compression],
    },
    openRouterChat: {
      ...(req.tools !== undefined && parallel !== undefined ? { parallelToolCalls: parallel } : {}),
      ...(req.responseFormat?.strict !== undefined ? { strict: req.responseFormat.strict } : {}),
    },
  };
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
}

async function streamOnce(args: StreamOnceArgs): Promise<StreamDrain> {
  const { call, req, label, markCommitted } = args;
  const chatId = castId<ChatId>(req.chatId ?? "");
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
    const { stream } = await model.doStream({ ...args.options, abortSignal: idle.signal });
    return await drainStream(stream, {
      label,
      onPart: idle.reset,
      onText: (text): void => {
        commit();
        req.onDelta?.({ chatId, kind: "text", text });
      },
      onReasoning: (text): void => {
        commit();
        req.onDelta?.({ chatId, kind: "reasoning", text });
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
    applied: { ...knobs.sampling, ...(knobs.verbosity !== undefined ? { verbosity: knobs.verbosity } : {}) },
    dropped: warnings
      .filter((w) => w.code === "sampling_knob_dropped" || w.code === "verbosity_dropped")
      .map((w) => ({ knob: w.knob ?? w.code, reason: w.message })),
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

/** Runs one chat-completions turn (the `responses` api is not wired on this transport — a typed refusal). */
export async function runOpenAiCompatChatTurn(req: OpenAiCompatChatRequest, deps: OpenAiCompatChatDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} chat (${connection.model})`;
  if (req.api !== "chat-completions") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the "${req.api}" api is not wired on the openai-compat wire (needs a responses transport)`,
    });
  }
  const generation = requireGeneration(connection, label);
  const dialect = connection.provider.dialect ?? "openai-compatible";
  const knobs = resolveChat(req.params, generation);
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  const secrets = resolvedScrubSet(connection);
  const anthropicRoute = dialect === "openrouter" && isAnthropicModel(connection.model);
  const plan = buildWirePlan({
    systemPrompt: req.systemPrompt,
    dynamicContextChannel: knobs.dynamicContextChannel,
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

  const run = (includeReasoning: boolean): Promise<StreamDrain> =>
    runWithPreCommitRetry(
      (markCommitted) => {
        const shape =
          dialect === "openrouter"
            ? openRouterShape(req, knobs, warnings, includeReasoning)
            : openAiCompatibleShape(req, knobs, warnings, connection.providerId);
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
        });
      },
      classify,
      retryOpts,
    );

  const drain = await drainWithReplay(run, dialect === "openrouter" && !knobs.reasoning.enabled);
  const turn = toChatResult(drain, {
    model: connection.model,
    providerId: connection.providerId,
    generation,
    maxOutputTokens: knobs.maxOutputTokens,
    startedAt,
    firstDeltaAt,
    now: deps.now(),
    measuredCostUsd: measuredCostOf(drain.providerMetadata),
    pricing: connection.features.pricing,
    generationId: dialect === "openrouter" ? (drain.responseId ?? null) : null,
    warnings,
  });
  emitReceipts({ log, req, generation, knobs, turn, written: cache.written, warnings });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}
