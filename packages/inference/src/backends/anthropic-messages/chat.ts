// ONE chat turn on the anthropic-messages wire over the SDK's V4 `doStream` (§8.5). The converter is the
// SDK's: it hoists the leading system block(s), places `cacheControl` per message, forwards a mid-history
// `system` row + its `clearAt`/`effort` under the betas the curated row enabled, and merges same-role rows
// (a no-op after our floor). Ours: the funnel, the prompt plan, the cache PLACEMENT (the one placer,
// `backends/kit/cache-control.ts`), the thinking/effort spelling, the shared reducer and result fold,
// pre-commit retry.
//
// AN ASSISTANT IMAGE IS DROPPED HERE, AND THE REASON IS THE WIRE, NOT THE HOOK. An earlier header claimed
// "the SDK exposes no post-convert hook" — that was false (`wrapFetch.shapeBody` is exactly one, and the
// openrouter transport re-attaches through it). MEASURED 2026-09-20 against the live API: an `image` block on
// an assistant row is `400 "messages.1.content: 'image' blocks are not permitted within assistant turns"`
// (req_011CfEBBYooCmJyWSAv45UPL; the identical body without the block is 200, req_011CfEBBZzjfJ88KQ58U3qzi).
// So a prior reply picture riding back has nowhere to go on this wire and is dropped LOUDLY, by the wire's
// own rule. (Second-order: the converter also GROUPS consecutive same-role rows into one wire message and
// hoists the leading system block out of `messages[]`, so the openai-compat transport's plan-index walk
// would not align here even if the block were legal.)

import type { JSONObject, LanguageModelV4CallOptions, SharedV4Headers, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, cacheMinTokensOf } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { scrubWireSchema } from "@orb/kit/json-schema";
import { estimateTokens } from "@orb/kit/tokens";
import type { AnthropicChatRequest, ChatHistoryMessage, ChatResult } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ChatEvent, RateLimitSnapshot } from "../../contract/events.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import { effortWordOf } from "../kit/applied-effort.ts";
import type { CacheBreakpointRow } from "../kit/cache-control.ts";
import { ANTHROPIC_CACHE_1H, computeCacheBreakpointPlacements } from "../kit/cache-control.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import type { ProviderLogger } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { rateLimitCanaryEvent, rateLimitFromHeaders } from "../kit/rate-limit-headers.ts";
import type { AddSpanEvent } from "../kit/retry.ts";
import { runWithPreCommitRetry } from "../kit/retry.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { emitTurnSpanEvents } from "../kit/turn-span.ts";
import { functionTools, jsonResponseFormat, standardSampling, toolChoiceOf } from "../v4/options.ts";
import type { WirePlan } from "../v4/prompt.ts";
import { buildWirePlan, withMessageOptions } from "../v4/prompt.ts";
import { appliedSampling, DROPPED_SAMPLING_CODES, measuredCostOf, sdkWarnings, toChatResult } from "../v4/result.ts";
import type { StreamDrain } from "../v4/stream.ts";
import { drainStream } from "../v4/stream.ts";
import { anthropicExtras } from "./extras.ts";
import type { AnthropicCall, AnthropicTransportDeps } from "./model.ts";
import { ANTHROPIC_KEY, anthropicModelFor } from "./model.ts";
import { refusalEventOf } from "./refusal.ts";

/** The SDK's effort enum — `minimal` has no arm on this wire and drops with a warning. */
const SDK_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type SdkEffort = (typeof SDK_EFFORTS)[number];

export interface AnthropicChatDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly log: InferenceLog;
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly transport: AnthropicTransportDeps;
}

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

function sdkEffortOf(effort: string | undefined, warnings: ResolvedWarning[], where: string): SdkEffort | undefined {
  if (effort === undefined) {
    return;
  }
  const found = SDK_EFFORTS.find((candidate) => candidate === effort);
  if (found === undefined) {
    warnings.push({ code: "effort_dropped", message: `${where} effort "${effort}" ignored: the anthropic wire spells low | medium | high | xhigh | max` });
  }
  return found;
}

/** `wireMeta` → the per-row anthropic provider options: a cache breakpoint, and on a mid-history system row
 *  the `clearAt` (only when the curated row says the model honours it) + the per-turn effort. */
function rowOptionsFor(generation: GenerationCapability, warnings: ResolvedWarning[]): (row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined {
  return (row) => {
    const meta = row.wireMeta;
    if (meta === undefined) {
      return;
    }
    const options: JSONObject = {};
    if (meta.cacheBreakpoint === true) {
      options["cacheControl"] = { ...ANTHROPIC_CACHE_1H };
    }
    if (row.role === "system" && meta.clearAt !== undefined) {
      if (generation.turns?.clearAt === true) {
        options["clearAt"] = meta.clearAt;
      } else {
        warnings.push({ code: "dynamic_context_demoted", message: "clearAt ignored: the curated row does not advertise the clear-at beta for this model" });
      }
    }
    const effort = row.role === "system" ? sdkEffortOf(meta.effort, warnings, "per-row") : undefined;
    if (effort !== undefined) {
      options["effort"] = effort;
    }
    return Object.keys(options).length > 0 ? { [ANTHROPIC_KEY]: options } : undefined;
  };
}

interface CacheWriteReceipt {
  readonly historyDepths: readonly number[];
  readonly systemBlocks: number;
  /** The TOOL-LIST breakpoint (audit C4): 1 when a `cacheControl` rode the last tool, else 0. Counted in the
   *  receipt's `breakpointsPlaced` because a breakpoint nobody counts is a cache write nobody can audit —
   *  Anthropic's per-request breakpoint budget is small and the receipt is how an operator sees it spent. */
  readonly toolBlocks: number;
}

function placeCache(args: {
  readonly plan: WirePlan;
  readonly req: AnthropicChatRequest;
  readonly generation: GenerationCapability;
  readonly log: ProviderLogger;
  readonly toolBlocks: number;
}): { readonly patches: Map<number, Record<string, unknown>>; readonly written: CacheWriteReceipt } {
  const { plan, req, generation, log, toolBlocks } = args;
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
  return { patches, written: { historyDepths, systemBlocks, toolBlocks } };
}

/** The `thinking` block per the resolved reasoning MODE — the policy already ran in the funnel. */
function thinkingOf(reasoning: ResolvedReasoning): JSONObject {
  if (!reasoning.enabled) {
    return { type: "disabled" };
  }
  const display = reasoning.display !== undefined ? { display: reasoning.display } : {};
  if (reasoning.mode === "budget") {
    return { type: "enabled", ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}) };
  }
  return { type: "adaptive", ...display };
}

/** THE TOOL-LIST CACHE BREAKPOINT (audit C4). The tool list is a large, stable prefix that changes far less
 *  often than the history does, and Anthropic caches everything up to a breakpoint — so one `cacheControl` on
 *  the LAST tool caches the whole list. Placed only when the model's capability says explicit prompt caching
 *  is worth the write; `undefined` leaves every tool's provider options absent, byte-identical to before. */
function toolCacheOptions(generation: GenerationCapability, explicit: boolean): SharedV4ProviderOptions | undefined {
  return explicit && generation.turns?.explicitPromptCache === true ? { [ANTHROPIC_KEY]: { cacheControl: { ...ANTHROPIC_CACHE_1H } } } : undefined;
}

function anthropicOptions(
  req: AnthropicChatRequest,
  knobs: ResolvedChatKnobs,
  warnings: ResolvedWarning[],
  toolCache: SharedV4ProviderOptions | undefined,
): Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal"> {
  const effort = knobs.reasoning.enabled ? sdkEffortOf(knobs.reasoning.effort, warnings, "turn") : undefined;
  if (knobs.verbosity !== undefined) {
    warnings.push({ code: "verbosity_dropped", message: "verbosity ignored: the anthropic wire has no verbosity field" });
  }
  const parallel = req.params.advanced?.parallelToolCalls;
  const anthropic: JSONObject = {
    // C2: the allowlisted `extras` slice FIRST, so nothing a connection declares can displace a modelled
    // knob below it (D143(b)/D156 — modelled wins; the allowlist itself excludes every modelled key).
    ...anthropicExtras(req.connection, warnings),
    sendReasoning: true,
    structuredOutputMode: "auto",
    thinking: thinkingOf(knobs.reasoning),
    ...(effort !== undefined ? { effort } : {}),
    ...(req.tools !== undefined && parallel === false ? { disableParallelToolUse: true } : {}),
  };
  return {
    ...standardSampling(knobs.sampling, knobs.maxOutputTokens),
    ...(req.tools !== undefined
      ? { tools: functionTools(req.tools, { strictJson: req.connection.features.strictJson, warnings, cacheLastTool: toolCache }) }
      : {}),
    ...(req.toolChoice !== undefined ? { toolChoice: toolChoiceOf(req.toolChoice) } : {}),
    ...(req.responseFormat !== undefined
      ? { responseFormat: jsonResponseFormat(req.responseFormat, scrubWireSchema(req.responseFormat.schema, "anthropic-format").schema) }
      : {}),
    providerOptions: { [ANTHROPIC_KEY]: anthropic },
  };
}

/** THE PREFILL BELT (§A2). The assembly already reshapes a trailing assistant row when the capability says
 *  the model refuses prefill (`needsContinuation`), so this never fires on the normal path — it exists so a
 *  caller that BYPASSES the assembly cannot reach the upstream 400. MEASURED 2026-09-19: `claude-opus-5` and
 *  `claude-opus-4-6` reject a trailing assistant row with a 400 — "This model does not support assistant
 *  message prefill" — on both routes, thinking on or off; `claude-opus-4-5` accepts it. A tool exchange is NOT a
 *  prefill (the plan's `endsOnAssistant` already excludes an assistant row that ends in a tool call). */
function refusePrefill(plan: WirePlan, generation: GenerationCapability, label: string): void {
  if (plan.endsOnAssistant && !acceptsAssistantPrefill(generation)) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the delivered history ends on an assistant row, and this model does not accept assistant message prefill`,
    });
  }
}

function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** B1: the effort THIS request carried, read off the OPTIONS the builder produced (never recomputed from the
 *  knobs): thinking spelled OFF ⇒ `none`; a spelled SDK effort ⇒ that word; neither (a `minimal` the SDK vocabulary
 *  dropped, an adaptive turn with no dial) ⇒ `null` — the model reasoned at its own default, which is unrecorded. */
function appliedEffortOf(options: Pick<LanguageModelV4CallOptions, "providerOptions">): EffortLevel | null {
  const anthropic = options.providerOptions?.[ANTHROPIC_KEY];
  const thinking = anthropic?.["thinking"];
  if (isJsonObject(thinking) && thinking["type"] === "disabled") {
    return "none";
  }
  return effortWordOf(anthropic?.["effort"]);
}

interface StreamOnceArgs {
  readonly call: AnthropicCall;
  readonly options: LanguageModelV4CallOptions;
  readonly req: AnthropicChatRequest;
  readonly now: () => number;
  readonly markCommitted: () => void;
  readonly onFirstDelta: (at: number) => void;
  /** The response headers the V4 stream result exposes (B6) — before the first part, once per attempt. */
  readonly onResponse: (headers: SharedV4Headers | undefined) => void;
}

async function streamOnce(args: StreamOnceArgs): Promise<StreamDrain> {
  const { call, req, markCommitted } = args;
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
    const { stream, response } = await anthropicModelFor(call).doStream({ ...args.options, abortSignal: idle.signal });
    args.onResponse(response?.headers);
    return await drainStream(stream, {
      label: call.label,
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

function emitReceipts(args: {
  readonly log: ProviderLogger;
  readonly req: AnthropicChatRequest;
  readonly generation: GenerationCapability;
  readonly knobs: ResolvedChatKnobs;
  readonly turn: ChatResult;
  readonly written: CacheWriteReceipt;
  readonly warnings: readonly ResolvedWarning[];
}): void {
  const { log, req, generation, knobs, turn, written, warnings } = args;
  const total = turn.usage.cacheReadTokens + turn.usage.cacheWriteTokens;
  log.cache({
    turnId: knobs.turnId,
    cacheReadTokens: turn.usage.cacheReadTokens,
    cacheWriteTokens: turn.usage.cacheWriteTokens,
    breakpointsPlaced: written.systemBlocks + written.historyDepths.length + written.toolBlocks,
    breakpointOffsets: written.historyDepths,
    hitRatio: total > 0 ? turn.usage.cacheReadTokens / total : 0,
    minCacheTokens: cacheMinTokensOf(generation),
  });
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
    applied: appliedSampling(knobs.sampling, warnings),
    dropped: warnings.filter((w) => DROPPED_SAMPLING_CODES.has(w.code)).map((w) => ({ knob: w.knob ?? w.code, reason: w.message })),
  });
}

export async function runAnthropicChatTurn(req: AnthropicChatRequest, deps: AnthropicChatDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} chat (${connection.model})`;
  const generation = requireGeneration(connection, label);
  const knobs = resolveChat(req.params, generation);
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  // A box, not a `let`: the value is assigned inside the stream callback, and TypeScript narrows a `let` read
  // after an `await` to its initializer (a property read is re-widened across the call).
  const response: { rateLimit: RateLimitSnapshot | null } = { rateLimit: null };
  const secrets = resolvedScrubSet(connection);
  const plan = buildWirePlan({
    systemPrompt: req.systemPrompt,
    dynamicContextChannel: knobs.dynamicContextChannel,
    history: req.history,
    rowOptions: rowOptionsFor(generation, warnings),
    splitSystem: true,
  });
  refusePrefill(plan, generation, label);
  if (plan.assistantMedia.size > 0) {
    warnings.push({
      code: "image_edit_dropped",
      message: "a prior reply picture was not re-sent: the Anthropic Messages wire does not permit image blocks inside an assistant turn",
    });
  }
  // C4: the tool list is its own cacheable prefix. Decided BEFORE `placeCache` so the receipt can count the
  // breakpoint the option builder is about to place (Anthropic's per-request breakpoint budget is small).
  const toolCache = toolCacheOptions(generation, req.tools !== undefined && req.tools.length > 0);
  const cache = placeCache({ plan, req, generation, log, toolBlocks: toolCache === undefined ? 0 : 1 });
  const prompt = withMessageOptions(plan.prompt, ANTHROPIC_KEY, cache.patches);
  const options = anthropicOptions(req, knobs, warnings, toolCache);
  const call: AnthropicCall = { connection, deps: deps.transport, label, api: req.api, chatId: req.chatId };
  const classify = (err: unknown): ProviderError => (err instanceof ProviderError ? err : providerErrorFromHttp(err, label, secrets));
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
  const drain = await runWithPreCommitRetry(
    (markCommitted) =>
      streamOnce({
        call,
        options: { ...options, prompt },
        req,
        now: deps.now,
        markCommitted,
        onFirstDelta: (at) => {
          firstDeltaAt = at;
        },
        onResponse: (headers) => {
          response.rateLimit = rateLimitFromHeaders(headers, deps.now());
        },
      }),
    classify,
    {
      ...(req.signal !== undefined ? { signal: req.signal } : {}),
      now: deps.now,
      ...(deps.random !== undefined ? { random: deps.random } : {}),
      ...(deps.addSpanEvent !== undefined ? { addSpanEvent: deps.addSpanEvent } : {}),
    },
  ).catch((err: unknown): never => {
    throw classify(err);
  });
  // The SDK's OWN drops (§A3) land in the SAME array as the funnel's, BEFORE the result is folded — so one
  // push reaches the turn's `warning` events, the capability receipt and the sampling receipt alike.
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
    // The `msg_…` response id — the support handle (B7); OpenRouter's is the `gen-…` on its own transport.
    generationId: drain.responseId ?? null,
    appliedEffort: appliedEffortOf(options),
    rateLimit: response.rateLimit,
    warnings,
  });
  // The direct wire's two extra signals beside the warnings (A5 · B6): a classifier block as the existing
  // `refusal` member, and the rate-limit canary from `allowed_warning` up.
  const extraEvents: ChatEvent[] = [refusalEventOf(drain, connection.model, finishedAt), rateLimitCanaryEvent(response.rateLimit, finishedAt)].filter(
    (event): event is ChatEvent => event !== null,
  );
  const turn: ChatResult = extraEvents.length > 0 ? { ...folded, events: [...folded.events, ...extraEvents] } : folded;
  if (response.rateLimit !== null) {
    log.emit(response.rateLimit.status === "allowed" ? "debug" : "warn", "provider.rate_limit", { turnId: knobs.turnId, ...response.rateLimit });
  }
  emitReceipts({ log, req, generation, knobs, turn, written: cache.written, warnings });
  // D4: the turn's own timeline. The receipts above are the LOG surface; these three are the TRACE surface,
  // and they answer the questions a span's duration alone cannot (first-delta split, stop reason, cache hit).
  emitTurnSpanEvents({
    addSpanEvent: deps.addSpanEvent,
    turnId: knobs.turnId,
    model: connection.model,
    startedAt,
    firstDeltaAt,
    turn,
    cache: {
      breakpointsPlaced: cache.written.systemBlocks + cache.written.historyDepths.length + cache.written.toolBlocks,
      readTokens: turn.usage.cacheReadTokens,
      writeTokens: turn.usage.cacheWriteTokens,
    },
  });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}
