// One chat turn over OpenRouter's `chat.send` (OpenAI chat-completions surface). Owns the Anthropic cache
// placement (system per-block + rolling history breakpoint) and the mandatory-reasoning strip-and-replay.

import type { ChatMessages, ChatRequest, ChatStreamChunk } from "@openrouter/sdk/models";
import { ChatRequest$outboundSchema } from "@openrouter/sdk/models";
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
  reshapeChatStreamChunk,
  resolveFallbackModels,
  resolveProviderPreferences,
  warningEvents,
  withCustomParametersDrop,
  withToolResultErrorDrop,
  withVerbosityDrop,
} from "./shared";

const REASONING_OFF = "none";

/**
 * Places the rolling-tail Anthropic cache pair at `depth` and `depth+2` (kept inside Anthropic's 20-block
 * lookback window, unlike a single breakpoint). Returns the array unchanged when no offset clears the
 * floor or its target content isn't a plain string.
 */
export function placeHistoryCacheBreakpoint(messages: ChatMessages[], systemStatic: string, offsetFromEnd: number, cacheMinTokens: number): ChatMessages[] {
  const offsets = computeCacheBreakpointOffsets({
    messageTokens: messages.map((m) => (typeof m.content === "string" ? estimateTokens(m.content) : 0)),
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

// Fail-closed to CACHE_MIN_FLOOR when the capability didn't seed an exact floor.
function historyCacheMinTokens(req: OpenRouterChatRequest): number {
  return req.capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

// Rolling-history breakpoint gate: qualifies only when the resolver says `explicitPromptCache` (an
// Anthropic-family fact, not an in-runner model-id sniff). `isAnthropicModel` separately still gates the
// static system-block cache below.
function historyCacheGateOffset(req: OpenRouterChatRequest): number | undefined {
  if (req.capability.turns?.explicitPromptCache !== true || req.api !== "chat-completions") {
    return;
  }
  return req.historyCacheBreakpointFromEnd;
}

// Recomputes the same positional decision `buildChatBody` applied, for the `provider.cache` receipt.
function historyCacheOffsets(req: OpenRouterChatRequest): readonly number[] {
  const offsetFromEnd = historyCacheGateOffset(req);
  if (offsetFromEnd === undefined) {
    return [];
  }
  const messages = buildHistoryMessages(req.history);
  return computeCacheBreakpointOffsets({
    messageTokens: messages.map((m) => (typeof m.content === "string" ? estimateTokens(m.content) : 0)),
    systemStaticTokens: estimateTokens(req.systemPrompt.static),
    offsetFromEnd,
    cacheMinTokens: historyCacheMinTokens(req),
  });
}

// A collapsed hitRatio with a spiked cacheWriteTokens is the cache-rot re-bill signal.
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
    breakpointsPlaced: (isAnthropicModel(req.model) ? 1 : 0) + offsets.length,
    breakpointOffsets: offsets,
    hitRatio: total > 0 ? cacheReadTokens / total : 0,
    minCacheTokens: historyCacheMinTokens(req),
  });
}

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

// OpenRouter's wire is official-only: the body is the runner-owned fields alone. A preset's `customParameters`
// escape hatch is BYOK/custom-byo-only and never reaches this wire (D41 drop surfaced as a loud warning).
function buildChatBody(req: OpenRouterChatRequest, resolved: ResolvedChatKnobs, includeReasoning: boolean): ChatRequest {
  const systemMessage = buildSystemMessage(req.systemPrompt, isAnthropicModel(req.model));
  const cacheOffset = historyCacheGateOffset(req);
  const history =
    cacheOffset !== undefined
      ? placeHistoryCacheBreakpoint(buildHistoryMessages(req.history), req.systemPrompt.static, cacheOffset, historyCacheMinTokens(req))
      : buildHistoryMessages(req.history);
  const messages: ChatMessages[] = systemMessage !== null ? [systemMessage, ...history] : history;
  const provider = resolveProviderPreferences(req.model, req.providerRouting);
  const fallbackModels = resolveFallbackModels(req.providerRouting);
  const owned: ChatRequest = {
    model: req.model,
    messages,
    stream: true,
    ...chatSamplingFields(resolved.sampling, resolved.maxOutputTokens),
    ...(includeReasoning ? { reasoning: effortToOpenAIReasoning(buildReasoningRequest(resolved.reasoning)) } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(fallbackModels !== undefined ? { models: fallbackModels } : {}),
    ...(req.tools !== undefined ? { tools: buildWireTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { toolChoice: buildToolChoice(req.toolChoice) } : {}),
    // Only meaningful alongside a tools[] request (a bare parallel flag is ignored/rejected upstream).
    ...(req.tools !== undefined && req.params.advanced?.parallelToolCalls !== undefined ? { parallelToolCalls: req.params.advanced.parallelToolCalls } : {}),
    ...(req.responseFormat !== undefined ? { responseFormat: buildChatResponseFormat(req.responseFormat) } : {}),
    plugins: withContextCompressionPlugin(req.params),
  };
  return owned;
}

// `markCommitted` fires on the first streamed delta so a retry can never replay tokens.
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

interface OpenRouterChatClient {
  readonly chat: {
    readonly send: (request: { readonly chatRequest: ChatRequest }, options?: { readonly signal?: AbortSignal }) => Promise<unknown>;
  };
}

function errorPrefix(model: string): string {
  return `openrouter chat (${model})`;
}

function isChunkStream(value: unknown): value is AsyncIterable<ChatStreamChunk> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

async function* reshapeStream(source: AsyncIterable<ChatStreamChunk>): AsyncGenerator<ReturnType<typeof reshapeChatStreamChunk>> {
  for await (const chunk of source) {
    yield reshapeChatStreamChunk(chunk);
  }
}

/** Runs one chat-completions turn, incl. the mandatory-reasoning strip-and-replay-once fallback. */
export async function runChatCompletionTurn(client: OpenRouterChatClient, req: OpenRouterChatRequest, deps: OpenRouterChatDeps): Promise<ChatResult> {
  const startedAt = deps.now();
  const retryOpts = {
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
  };
  const resolved = resolveChat(req.params, req.capability);
  const reasoning = effortToOpenAIReasoning(buildReasoningRequest(resolved.reasoning));
  const run = (includeReasoning: boolean): Promise<{ view: ChatCompletionResult; reasoning: string }> =>
    runWithPreCommitRetry(
      (markCommitted) => {
        const body = buildChatBody(req, resolved, includeReasoning);
        // Capture the TRUE wire: the SDK's own outbound schema renames camelCase→snake_case and strips unknown
        // keys before the real HTTP send, so parsing here records the literal bytes, not the pre-serialize input.
        deps.captureWire?.({
          chatId: req.chatId,
          api: req.api,
          backend: "openrouter",
          model: req.model,
          body: ChatRequest$outboundSchema.parse(body) as Record<string, unknown>,
        });
        return streamOnce({
          client,
          body,
          req,
          markCommitted,
        });
      },
      (err): ProviderError => (err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(req.model))),
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
  // chat-completions has NO verbosity field, so a resolved verbosity is dropped loudly here; a customParameters
  // blob is likewise BYOK-only and dropped loudly on the OpenRouter wire; a tool-result `isError` flag has no
  // wire slot at all and is dropped loudly too (D41 no-silent-degrade).
  const warnings = warningEvents(withToolResultErrorDrop(withCustomParametersDrop(withVerbosityDrop(resolved), req.customParameters), req.history), deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
