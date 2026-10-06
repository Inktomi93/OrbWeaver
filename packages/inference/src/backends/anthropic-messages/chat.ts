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
import type { GenerationCapability, ReasoningOffMode } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, acceptsTurnScopedSystem, bindsThinkingToPrefix, cacheMinTokensOf, REASONING_OFF_DEFAULT } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import type { AnthropicChatRequest, ChatHistoryMessage, ChatResult } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ChatEvent, RateLimitSnapshot } from "../../contract/events.ts";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveCachePolicy } from "../../funnel/resolve-cache.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import type { StructuredPlan } from "../../structured/plan.ts";
import { requireStructuredPlan } from "../../structured/plan.ts";
import { structuredChatResult } from "../../structured/reply.ts";
import { effortWordOf } from "../kit/applied-effort.ts";
import type { ExplicitCachePlan } from "../kit/cache-control.ts";
import { automaticCachePlan, explicitCachePlan, placeExplicitCacheMarkers } from "../kit/cache-control.ts";
import { providerErrorFromHttp, withSchemaRejection } from "../kit/error-classify.ts";
import { observeChatResult } from "../kit/generation-observation.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import type { ProviderLogger } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { prefixBindingDropsOf } from "../kit/provider-metadata.ts";
import { rateLimitCanaryEvent, rateLimitFromHeaders } from "../kit/rate-limit-headers.ts";
import { cachePolicyContextOf } from "../kit/response-cache.ts";
import { runWithPreCommitRetry } from "../kit/retry.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { emitTurnSpanEvents } from "../kit/turn-span.ts";
import { plannedOptions, standardSampling } from "../v4/options.ts";
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

/** `wireMeta` → the per-row anthropic provider options: a cache breakpoint (under the turn's plan — none when
 *  the connection turned caching off), and on a mid-history system row the `clearAt` (only when the curated row
 *  says the model honours it) + the per-turn effort. */
function rowOptionsFor(
  generation: GenerationCapability,
  cachePlan: ExplicitCachePlan | null,
  warnings: ResolvedWarning[],
): (row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined {
  return (row) => {
    const meta = row.wireMeta;
    if (meta === undefined) {
      return;
    }
    const options: JSONObject = {};
    if (meta.cacheBreakpoint === true && cachePlan !== null) {
      options["cacheControl"] = { ...cachePlan.directive };
    }
    if (row.role === "system" && meta.clearAt !== undefined) {
      if (acceptsTurnScopedSystem(generation)) {
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
  readonly requestBlocks: number;
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
  readonly cachePlan: ExplicitCachePlan | null;
  readonly generation: GenerationCapability;
  readonly log: ProviderLogger;
  readonly toolBlocks: number;
  readonly automaticCache: ExplicitCachePlan | null;
}): { readonly patches: ReadonlyMap<number, Record<string, unknown>>; readonly written: CacheWriteReceipt } {
  const { plan, req, cachePlan, generation, log, toolBlocks } = args;
  const placed = placeExplicitCacheMarkers({ plan: cachePlan, rows: plan.rows, staticSystem: req.systemPrompt.static.trim(), generation, log });
  return {
    patches: placed.patches,
    written: { historyDepths: placed.historyDepths, systemBlocks: placed.systemBlocks, toolBlocks, requestBlocks: args.automaticCache === null ? 0 : 1 },
  };
}

/** The off `thinking` block per the model's off mode. `between_tools` takes no other thinking field: a `display`
 *  or `block_binding` beside it is a 400. */
const OFF_THINKING: Readonly<Record<ReasoningOffMode, JSONObject>> = {
  disabled: { type: "disabled" },
  "between-tools": { type: "between_tools" },
};

/** The thinking types that run no thinking before the reply; a turn that sent one ran with reasoning off. */
const OFF_THINKING_TYPES: readonly unknown[] = Object.values(OFF_THINKING).map((thinking) => thinking["type"]);

/** The `thinking` block per the resolved reasoning MODE — the policy already ran in the funnel. */
function thinkingOf(reasoning: ResolvedReasoning): JSONObject {
  if (!reasoning.enabled) {
    return OFF_THINKING[reasoning.offMode ?? REASONING_OFF_DEFAULT];
  }
  const display = reasoning.display !== undefined ? { display: reasoning.display } : {};
  if (reasoning.mode === "budget") {
    return { type: "enabled", ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}) };
  }
  return { type: "adaptive", ...display };
}

/** Manual extended thinking (`thinking: enabled`) refuses a forced `tool_choice` on every model (the Messages API's
 *  tool-use docs), so a turn that sends it asks the plan for no forced choice. */
function forcedChoiceOf(reasoning: ResolvedReasoning): false | undefined {
  return reasoning.enabled && reasoning.mode === "budget" ? false : undefined;
}

/** Preserved thinking: on a prefix-bound model a replayed thinking block whose earlier prefix changed is a 400
 *  unless the request asks the API to drop it. Every carry rung replays thinking, so every rung asks: a missed
 *  edit then costs that block, counted and raised by {@link raiseThinkingDrops}, never the turn. The SDK spells
 *  `block_binding` and adds its beta. The API also takes the field beside `enabled` thinking, but the SDK's
 *  `enabled` and `disabled` arms have no `blockBinding` and strip it, so it rides only beside adaptive thinking. */
function withBlockBinding(thinking: JSONObject, knobs: ResolvedChatKnobs, generation: GenerationCapability): JSONObject {
  if (knobs.carryReasoning === "off" || !bindsThinkingToPrefix(generation) || thinking["type"] !== "adaptive") {
    return thinking;
  }
  return { ...thinking, blockBinding: { prefixMismatchBehavior: "drop_block" } };
}

/** The operator alarm for thinking the API dropped under `drop_block`. The carried history is built append-only,
 *  so every drop names a prefix edit to find; the per-turn count rides the record's provider sidecar
 *  (`thinkingDropped`). Paths only, never content. */
function raiseThinkingDrops(log: ProviderLogger, drain: StreamDrain, turnId: string, model: string): void {
  const paths = prefixBindingDropsOf(drain.providerMetadata?.[ANTHROPIC_KEY]) ?? [];
  if (paths.length > 0) {
    log.emit("error", "provider.thinking_dropped", { turnId, model, dropped: paths.length, paths });
  }
}

/** THE TOOL-LIST CACHE BREAKPOINT (audit C4). The tool list is a large, stable prefix that changes far less
 *  often than the history does, and Anthropic caches everything up to a breakpoint — so one `cacheControl` on
 *  the LAST tool caches the whole list. Placed only when the model's capability says explicit prompt caching
 *  is worth the write AND the connection has caching on; `undefined` leaves every tool's provider options
 *  absent. Tools come FIRST in Anthropic's prefix order, so this marker carries the turn's one directive: a
 *  5m tool marker ahead of a 1h system or history marker is exactly the order the API forbids. */
function toolCacheOptions(generation: GenerationCapability, cachePlan: ExplicitCachePlan | null, hasTools: boolean): SharedV4ProviderOptions | undefined {
  return hasTools && cachePlan !== null && generation.turns?.explicitPromptCache === true
    ? { [ANTHROPIC_KEY]: { cacheControl: { ...cachePlan.directive } } }
    : undefined;
}

/** How the SDK carries a planned payload: `outputFormat` (`output_config.format`) for a native format, so the SDK
 *  never picks a vehicle itself, and one call with parallel use off for a tool vehicle. */
function anthropicStructuredOptions(plan: StructuredPlan): JSONObject {
  const vehicle = plan.responseFormat?.vehicle;
  if (vehicle === undefined) {
    return {};
  }
  return vehicle === "response-format" ? { structuredOutputMode: "outputFormat" } : { disableParallelToolUse: true };
}

/** The planned schema when the payload rides `output_config.format`; a tool vehicle's schema is the tool's own. */
function nativeSchemaOf(plan: StructuredPlan | undefined): Record<string, unknown> | undefined {
  return plan?.responseFormat?.vehicle === "response-format" ? plan.responseFormat.schema : undefined;
}

function anthropicOptions(
  req: AnthropicChatRequest,
  knobs: ResolvedChatKnobs,
  warnings: ResolvedWarning[],
  model: {
    readonly generation: GenerationCapability;
    readonly toolCache: SharedV4ProviderOptions | undefined;
    readonly plan: StructuredPlan;
    readonly automaticCache: ExplicitCachePlan | null;
  },
): Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal"> {
  const { generation, toolCache, plan } = model;
  const effort = knobs.reasoning.enabled ? sdkEffortOf(knobs.reasoning.effort, warnings, "turn") : undefined;
  if (knobs.verbosity !== undefined) {
    warnings.push({ code: "verbosity_dropped", message: "verbosity ignored: the anthropic wire has no verbosity field" });
  }
  const parallel = req.params.advanced?.parallelToolCalls;
  const anthropic: JSONObject = {
    // C2: the allowlisted `extras` slice FIRST, so nothing a connection declares can displace a modelled
    // knob below it (D143(b)/D156 — modelled wins; the allowlist itself excludes every modelled key).
    ...anthropicExtras(req.connection, warnings),
    ...(model.automaticCache === null ? {} : { cacheControl: { ...model.automaticCache.directive } }),
    sendReasoning: true,
    thinking: withBlockBinding(thinkingOf(knobs.reasoning), knobs, generation),
    ...(effort !== undefined ? { effort } : {}),
    ...(plan.tools !== undefined && parallel === false ? { disableParallelToolUse: true } : {}),
    ...anthropicStructuredOptions(plan),
  };
  return {
    ...standardSampling(knobs.sampling, knobs.maxOutputTokens),
    ...plannedOptions(plan, { cacheLastTool: toolCache }),
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
 *  knobs): thinking spelled OFF (either off spelling) ⇒ `none`; a spelled SDK effort ⇒ that word; neither (a
 *  `minimal` the SDK vocabulary dropped, an adaptive turn with no dial) ⇒ `null` — the model reasoned at its own
 *  default, which is unrecorded. */
function appliedEffortOf(options: Pick<LanguageModelV4CallOptions, "providerOptions">): EffortLevel | null {
  const anthropic = options.providerOptions?.[ANTHROPIC_KEY];
  const thinking = anthropic?.["thinking"];
  if (isJsonObject(thinking) && OFF_THINKING_TYPES.includes(thinking["type"])) {
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
  const deltaTarget = req.chatId === undefined || req.onDelta === undefined ? undefined : { chatId: req.chatId, onDelta: req.onDelta };
  const idle = turnAbortSignal(req.signal, req.connection.features.requestTimeoutMs);
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
  const { cacheReadTokens, cacheWriteTokens } = turn.usage;
  const total = cacheReadTokens !== null && cacheWriteTokens !== null ? cacheReadTokens + cacheWriteTokens : null;
  let hitRatio: number | null = null;
  if (total !== null && cacheReadTokens !== null) {
    hitRatio = total > 0 ? cacheReadTokens / total : 0;
  }
  log.cache({
    turnId: knobs.turnId,
    cacheReadTokens: turn.usage.cacheReadTokens,
    cacheWriteTokens: turn.usage.cacheWriteTokens,
    breakpointsPlaced: written.systemBlocks + written.historyDepths.length + written.toolBlocks + written.requestBlocks,
    breakpointOffsets: written.historyDepths,
    hitRatio,
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
  const knobs = resolveChat(req.params, generation, { posture: req.posture, wire: connection.wire });
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  // A box, not a `let`: the value is assigned inside the stream callback, and TypeScript narrows a `let` read
  // after an `await` to its initializer (a property read is re-widened across the call).
  const response: { rateLimit: RateLimitSnapshot | null } = { rateLimit: null };
  const secrets = resolvedScrubSet(connection);
  const policy = resolveCachePolicy({
    context: cachePolicyContextOf(connection, false),
    generation,
    preset: req.params.responseCache,
    request: req.responseCache,
    requestedDepth: req.cacheBreakpointDepth,
  });
  warnings.push(...policy.warnings);
  const cachePlan = explicitCachePlan(policy.plan);
  const automaticCache = automaticCachePlan(policy.plan);
  const plan = buildWirePlan({
    systemPrompt: req.systemPrompt,
    history: req.history,
    rowOptions: rowOptionsFor(generation, cachePlan, warnings),
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
  const toolCache = toolCacheOptions(generation, cachePlan, req.tools !== undefined && req.tools.length > 0);
  const cache = placeCache({ plan, req, cachePlan, generation, log, toolBlocks: toolCache === undefined ? 0 : 1, automaticCache });
  const prompt = withMessageOptions(plan.prompt, ANTHROPIC_KEY, cache.patches);
  const structured = requireStructuredPlan(
    connection,
    {
      formats: req.responseFormat === undefined ? undefined : [req.responseFormat],
      tools: req.tools,
      toolChoice: req.toolChoice,
      forcedChoice: forcedChoiceOf(knobs.reasoning),
      // Anthropic: message prefilling is incompatible with JSON outputs.
      nativeFormat: plan.endsOnAssistant ? false : undefined,
    },
    label,
  );
  warnings.push(...structured.downgrades);
  const options = anthropicOptions(req, knobs, warnings, { generation, toolCache, plan: structured, automaticCache });
  const call: AnthropicCall = { connection, deps: deps.transport, label, api: req.api, chatId: req.chatId, plannedSchema: nativeSchemaOf(structured) };
  const classify = (err: unknown): ProviderError =>
    err instanceof ProviderError
      ? err
      : withSchemaRejection(providerErrorFromHttp(err, label, secrets), err, { log, model: connection.model, mode: structured.mode, secrets });
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
  await observeChatResult(req, folded);
  const turn: ChatResult = structuredChatResult(extraEvents.length > 0 ? { ...folded, events: [...folded.events, ...extraEvents] } : folded, structured);
  if (response.rateLimit !== null) {
    log.emit(response.rateLimit.status === "allowed" ? "debug" : "warn", "provider.rate_limit", { turnId: knobs.turnId, ...response.rateLimit });
  }
  emitReceipts({ log, req, generation, knobs, turn, written: cache.written, warnings });
  raiseThinkingDrops(log, drain, knobs.turnId, connection.model);
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
      breakpointsPlaced: cache.written.systemBlocks + cache.written.historyDepths.length + cache.written.toolBlocks + cache.written.requestBlocks,
      readTokens: turn.usage.cacheReadTokens,
      writeTokens: turn.usage.cacheWriteTokens,
    },
  });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}
