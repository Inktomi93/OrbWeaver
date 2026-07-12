// infra/providers/backends/openrouter/runners/chat/chat-completions — ONE chat turn over OpenRouter's
// `chat.send` (the OpenAI chat-completions surface). Owns the Anthropic cache placement (system per-block +
// the rolling history breakpoint), the sampling/reasoning/provider-routing wire shaping (via shared.ts),
// the pre-commit retry, and the mandatory-reasoning strip-and-replay-ONCE. Streams always (`stream:true`)
// and drains through the shared kit reducer; the SDK handles SSE, so each SDK chunk is reshaped into the
// kit chunk before the reducer sees it. Imports `backends/kit` DOWN; never reaches a sibling backend.

import type { ChatMessages, ChatRequest, ChatStreamChunk } from "@openrouter/sdk/models";
import { CACHE_MIN_FLOOR } from "@orb/contracts/connection";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import type { ChatResult, OpenRouterChatRequest, ResolvedChatKnobs } from "../../../../contract";
import { ProviderError } from "../../../../contract";
import { resolveChat } from "../../../../resolve-chat";
import type { ChatCompletionResult, StreamReduceOptions } from "../../../kit";
import {
  cacheControlBlock,
  computeCacheBreakpointOffsets,
  effortToOpenAIReasoning,
  isAnthropicModel,
  logProviderCache,
  logProviderCapability,
  mapChatCompletionToTurnResult,
  providerErrorFromHttp,
  reduceChatCompletionStream,
  runWithPreCommitRetry,
  turnAbortSignal,
} from "../../../kit";
import { withContextCompressionPlugin } from "./context-compression";
import type { OpenRouterChatDeps } from "./shared";
import {
  buildChatResponseFormat,
  buildHistoryMessages,
  buildReasoningRequest,
  buildSystemMessage,
  buildToolChoice,
  buildWireTools,
  chatSamplingFields,
  emitSamplingReceipt,
  isMandatoryReasoningRejection,
  mergeCustomParameters,
  reshapeChatStreamChunk,
  resolveProviderPreferences,
  warningEvents,
  withVerbosityDrop,
} from "./shared";

// The off-switch wire value — drives the mandatory-reasoning detection (a `none` request that 400s on a
// reasoning-required endpoint is the strip-and-replay trigger).
const REASONING_OFF = "none";

/**
 * Place the rolling-tail Anthropic cache PAIR (Esoteric §5 / R1): from the ONE safe `offsetFromEnd` SHAPE
 * computed, pin `cache_control` at `depth` AND `depth+2` (the pure positional decision comes from the
 * kit-hoisted {@link computeCacheBreakpointOffsets}, gated on the per-model `cacheMinTokens` floor). Each
 * qualifying offset whose target content is a plain string is converted to the OpenAI-compat per-block
 * `cache_control` form. The system block is the FIRST of the ≤4 breakpoints; this pair is #2/#3. The PAIR
 * keeps a cache hit inside Anthropic's 20-block lookback window that a single breakpoint drops on a long
 * conversation (both sit on already-cached stable content, so the deeper read is FREE). Returns the array
 * unchanged when no offset clears the floor or its target content isn't a plain string.
 */
export function placeHistoryCacheBreakpoint(
  messages: ChatMessages[],
  systemStatic: string,
  offsetFromEnd: number,
  cacheMinTokens: number,
): ChatMessages[] {
  const offsets = computeCacheBreakpointOffsets({
    messageTokens: messages.map((m) =>
      typeof m.content === "string" ? estimateTokens(m.content) : 0,
    ),
    systemStaticTokens: estimateTokens(systemStatic),
    offsetFromEnd,
    cacheMinTokens,
  });
  if (offsets.length === 0) {
    return messages;
  }
  const replaced = messages.slice();
  for (const offset of offsets) {
    const targetIdx = messages.length - 1 - offset;
    const target = replaced.at(targetIdx);
    if (target !== undefined && typeof target.content === "string") {
      replaced[targetIdx] = { ...target, content: [cacheControlBlock(target.content)] };
    }
  }
  return replaced;
}

// The per-model minimum cacheable prefix for THIS request — the resolved `turns.cacheMinTokens`, fail-closed
// to `CACHE_MIN_FLOOR` when the capability didn't seed an exact floor (part 01 §4b). Read only when the
// history-breakpoint gate qualifies (`explicitPromptCache`), so an unseeded arm never under-caches.
function historyCacheMinTokens(req: OpenRouterChatRequest): number {
  return req.capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

// The OR history-cache gate (part 01 §5 explicit-cache row): OUR domain-computed PAIR placement is worth
// it iff the resolver says `explicitPromptCache` (an ANTHROPIC-family fact, ruling 3 — NOT an in-runner
// model-id sniff) AND SHAPE handed a safe offset. Replaces the old `isAnthropicModel(req.model)` + hardcoded
// 1024. Returns the SHAPE-computed safe offset when the gate qualifies, else `undefined`. The sealed
// wire-dialect `isAnthropicModel` still gates the STATIC system-block cache + the provider pin below — this
// gate only governs the rolling history breakpoint.
function historyCacheGateOffset(req: OpenRouterChatRequest): number | undefined {
  if (req.capability.turns?.explicitPromptCache !== true || req.api !== "chat-completions") {
    return;
  }
  return req.historyCacheBreakpointFromEnd;
}

// The history-cache PAIR offsets this turn actually placed — the SAME positional decision `buildChatBody`
// applied, recomputed for the `provider.cache` receipt (deterministic; no wire branch at the emit site).
// Empty when the gate didn't apply or no offset cleared the floor.
function historyCacheOffsets(req: OpenRouterChatRequest): readonly number[] {
  const offsetFromEnd = historyCacheGateOffset(req);
  if (offsetFromEnd === undefined) {
    return [];
  }
  const messages = buildHistoryMessages(req.history);
  return computeCacheBreakpointOffsets({
    messageTokens: messages.map((m) =>
      typeof m.content === "string" ? estimateTokens(m.content) : 0,
    ),
    systemStaticTokens: estimateTokens(req.systemPrompt.static),
    offsetFromEnd,
    cacheMinTokens: historyCacheMinTokens(req),
  });
}

// Emit the per-turn `provider.cache` receipt (part 05 §3a) — THE cache-rot signal: a collapsed `hitRatio`
// with a spiked `cacheWriteTokens` IS the ~12.7k re-bill, greppable as `provider:true event:provider.cache`.
// Decoupled: reads RESOLVED facts (usage counts + the placer's returned offsets + the resolved floor), no
// model-id/wire branch. Only Anthropic-cache turns qualify (the static system block counts as breakpoint #1
// on an Anthropic model; the history pair adds #2/#3), so a non-caching turn emits nothing.
function emitCacheReceipt(req: OpenRouterChatRequest, turn: ChatResult, turnId: string): void {
  if (req.capability.turns?.explicitPromptCache !== true) {
    return;
  }
  const offsets = historyCacheOffsets(req);
  const cacheReadTokens = turn.usage.cacheReadTokens;
  const cacheWriteTokens = turn.usage.cacheWriteTokens;
  const total = cacheReadTokens + cacheWriteTokens;
  logProviderCache("openrouter", {
    turnId,
    cacheReadTokens,
    cacheWriteTokens,
    // The static system block is breakpoint #1 on an Anthropic model; the rolling pair adds the rest.
    breakpointsPlaced: (isAnthropicModel(req.model) ? 1 : 0) + offsets.length,
    breakpointOffsets: offsets,
    hitRatio: total > 0 ? cacheReadTokens / total : 0,
    minCacheTokens: historyCacheMinTokens(req),
  });
}

// The `provider.capability` resolution line (part 05 §3c). Decoupled: reads RESOLVED facts (`api` +
// `credentialSource` off the request the runner already holds, the resolved `turns` cell, the funnel's
// warnings) — NO `wireShape` string materialized (that stays domain-internal per the anti-ST bar); `api`
// + `credentialSource` are REPORT-ONLY fields, information-equivalent to it, the SAME vocab `provider.turn`
// already carries. NO model-id/wire branch at the emit site.
function emitCapabilityReceipt(req: OpenRouterChatRequest, resolved: ResolvedChatKnobs): void {
  logProviderCapability("openrouter", {
    turnId: resolved.turnId,
    api: req.api,
    credentialSource: req.credential.source,
    requestedModel: req.model,
    turns: { ...req.capability.turns },
    droppedWarnings: resolved.warnings.map((w) => ({ code: w.code, message: w.message })),
  });
}

// Assemble the typed `ChatRequest` body from the capability-RESOLVED knobs (`resolve-chat` already gated
// sampling/reasoning/output). `includeReasoning` is false on the mandatory-reasoning replay (the endpoint
// rejected the `none` block). The user's `customParameters` are overlaid UNDER the runner-owned fields
// (owned wins — the preset-hijack firewall).
function buildChatBody(
  req: OpenRouterChatRequest,
  resolved: ResolvedChatKnobs,
  includeReasoning: boolean,
): ChatRequest {
  const systemMessage = buildSystemMessage(req.systemPrompt, isAnthropicModel(req.model));
  const cacheOffset = historyCacheGateOffset(req);
  const history =
    cacheOffset !== undefined
      ? placeHistoryCacheBreakpoint(
          buildHistoryMessages(req.history),
          req.systemPrompt.static,
          cacheOffset,
          historyCacheMinTokens(req),
        )
      : buildHistoryMessages(req.history);
  const messages: ChatMessages[] = systemMessage !== null ? [systemMessage, ...history] : history;
  const provider = resolveProviderPreferences(req.model, req.providerRouting);
  const owned: ChatRequest = {
    model: req.model,
    messages,
    stream: true,
    ...chatSamplingFields(resolved.sampling, resolved.maxOutputTokens),
    ...(includeReasoning
      ? { reasoning: effortToOpenAIReasoning(buildReasoningRequest(resolved.reasoning)) }
      : {}),
    ...(provider !== undefined ? { provider } : {}),
    // D48/T2: absent means ABSENT (never []/defaults) — a tool-less/format-less request stays
    // byte-identical to pre-D48; the `auto` toolChoice default is the CALLER's, never hardwired here.
    ...(req.tools !== undefined ? { tools: buildWireTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { toolChoice: buildToolChoice(req.toolChoice) } : {}),
    ...(req.responseFormat !== undefined
      ? { responseFormat: buildChatResponseFormat(req.responseFormat) }
      : {}),
    plugins: withContextCompressionPlugin(req.params),
  };
  return mergeCustomParameters(owned, req.customParameters);
}

// One full attempt: open the stream, reshape each SDK chunk into the kit chunk, drain it. A fresh
// idle-abort signal is built per attempt; `markCommitted` fires on the first streamed delta so a retry can
// never replay tokens. Every failure throws a typed `ProviderError`.
async function streamOnce(args: {
  readonly client: OpenRouterChatClient;
  readonly body: ChatRequest;
  readonly req: OpenRouterChatRequest;
  readonly markCommitted: () => void;
}): Promise<{ readonly view: ChatCompletionResult; readonly reasoning: string }> {
  const { client, body, req, markCommitted } = args;
  const chatId = castId<ChatId>(req.chatId ?? "");
  const idle = turnAbortSignal(req.signal);
  let reasoning = "";
  const reduceOpts: StreamReduceOptions = {
    onChunk: idle.reset,
    onDelta: (delta): void => {
      markCommitted();
      if (delta.kind === "reasoning") {
        reasoning += delta.text;
      }
      req.onDelta?.({ chatId, kind: delta.kind, text: delta.text });
    },
  };
  try {
    const result = await client.chat.send({ chatRequest: body }, { signal: idle.signal });
    if (!isChunkStream(result)) {
      // `stream:true` always yields an EventStream; a non-stream result is an upstream contract break.
      throw new ProviderError({
        kind: "server",
        retryable: true,
        message: `openrouter chat (${req.model}): expected a streaming response`,
      });
    }
    const view = await reduceChatCompletionStream(reshapeStream(result), reduceOpts);
    return { view, reasoning };
  } catch (err) {
    if (err instanceof ProviderError) {
      throw err;
    }
    throw providerErrorFromHttp(err, errorPrefix(req.model));
  } finally {
    idle.dispose();
  }
}

// The structural slice this runner needs off the client port (keeps the param type small per useMaxParams).
interface OpenRouterChatClient {
  readonly chat: {
    readonly send: (
      request: { readonly chatRequest: ChatRequest },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<unknown>;
  };
}

function errorPrefix(model: string): string {
  return `openrouter chat (${model})`;
}

// File-local guard: is the send result the streaming `EventStream` (an `AsyncIterable`)?
function isChunkStream(value: unknown): value is AsyncIterable<ChatStreamChunk> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

// Reshape each SDK stream chunk into the kit chunk the reducer consumes.
async function* reshapeStream(
  source: AsyncIterable<ChatStreamChunk>,
): AsyncGenerator<ReturnType<typeof reshapeChatStreamChunk>> {
  for await (const chunk of source) {
    yield reshapeChatStreamChunk(chunk);
  }
}

/**
 * Run one chat-completions turn. Builds the typed body, drives the pre-commit retry, and — when an
 * `effort:"none"` request hits a mandatory-reasoning endpoint (DeepSeek-R1) — strips the reasoning block
 * and replays ONCE (pre-commit-safe: the 400 fires before any delta). Maps the drained view → `ChatResult`
 * with the capability's context window / output cap as provenance.
 */
export async function runChatCompletionTurn(
  client: OpenRouterChatClient,
  req: OpenRouterChatRequest,
  deps: OpenRouterChatDeps,
): Promise<ChatResult> {
  const startedAt = deps.now();
  const retryOpts = {
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
  };
  // The ONE intent×capability funnel call for this turn (sampling/reasoning/output all gated here).
  const resolved = resolveChat(req.params, req.capability);
  const reasoning = effortToOpenAIReasoning(buildReasoningRequest(resolved.reasoning));
  const run = (
    includeReasoning: boolean,
  ): Promise<{ view: ChatCompletionResult; reasoning: string }> =>
    runWithPreCommitRetry(
      (markCommitted) =>
        streamOnce({
          client,
          body: buildChatBody(req, resolved, includeReasoning),
          req,
          markCommitted,
        }),
      (err): ProviderError =>
        err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(req.model)),
      retryOpts,
    );

  let result: { view: ChatCompletionResult; reasoning: string };
  try {
    result = await run(true);
  } catch (err) {
    if (reasoning.effort === REASONING_OFF && isMandatoryReasoningRejection(err)) {
      result = await run(false);
    } else {
      throw err;
    }
  }

  const turn = mapChatCompletionToTurnResult(result.view, {
    model: req.model,
    startedAt,
    now: deps.now(),
    contextWindow: req.capability.context.window,
    maxOutputTokens: req.capability.output.maxTokens.max,
    reasoning: result.reasoning,
  });
  emitCacheReceipt(req, turn, resolved.turnId);
  emitCapabilityReceipt(req, resolved);
  emitSamplingReceipt(req.params, resolved);
  // Surface resolve-chat's dropped/ignored-knob notes as `warning` events (the mapper returns `events:[]`,
  // so they merge in here) and fire `onEvent` for each — never silently dropped. The chat-completions wire
  // has NO verbosity field (SDK 0.13.19), so a RESOLVED verbosity (the model listed it, the funnel kept it)
  // is dropped LOUDLY here — a second, wire-specific `verbosity_dropped` note (D68-B, verify-then-add).
  const warnings = warningEvents(withVerbosityDrop(resolved), deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
