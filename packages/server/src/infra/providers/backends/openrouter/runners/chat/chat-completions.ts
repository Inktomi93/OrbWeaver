// infra/providers/backends/openrouter/runners/chat/chat-completions — ONE chat turn over OpenRouter's
// `chat.send` (the OpenAI chat-completions surface). Owns the Anthropic cache placement (system per-block +
// the rolling history breakpoint), the sampling/reasoning/provider-routing wire shaping (via shared.ts),
// the pre-commit retry, and the mandatory-reasoning strip-and-replay-ONCE. Streams always (`stream:true`)
// and drains through the shared kit reducer; the SDK handles SSE, so each SDK chunk is reshaped into the
// kit chunk before the reducer sees it. Imports `backends/kit` DOWN; never reaches a sibling backend.

import type { ChatMessages, ChatRequest, ChatStreamChunk } from "@openrouter/sdk/models";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import type { ChatResult, OpenRouterChatRequest, ResolvedChatKnobs } from "../../../../contract";
import { ProviderError } from "../../../../contract";
import { resolveChat } from "../../../../resolve-chat";
import type { ChatCompletionResult, StreamReduceOptions } from "../../../kit";
import {
  cacheControlBlock,
  effortToOpenAIReasoning,
  isAnthropicModel,
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
  isMandatoryReasoningRejection,
  mergeCustomParameters,
  reshapeChatStreamChunk,
  resolveProviderPreferences,
  warningEvents,
} from "./shared";

// Anthropic's minimum cacheable prefix (~1024 tokens for Claude). A breakpoint below it only burns one of
// the four breakpoint slots without forming a cache entry, so the placement is gated on this floor.
const ANTHROPIC_CACHE_MIN_TOKENS = 1024;
// The off-switch wire value — drives the mandatory-reasoning detection (a `none` request that 400s on a
// reasoning-required endpoint is the strip-and-replay trigger).
const REASONING_OFF = "none";

/**
 * Place the rolling-tail Anthropic cache breakpoint (Esoteric §5): convert the message at
 * `offsetFromEnd` (the offset the chat pipeline computed; robust to the empty-content filter) into the
 * per-block `cache_control` form, gated on `cacheMinTokens` (the estimated prefix up to and including the
 * target must clear the floor, else the breakpoint is skipped). The system block is the FIRST breakpoint;
 * this is the SECOND — both stay under Anthropic's 4-breakpoint cap. Returns the array unchanged when the
 * offset is out of range, the target content isn't a plain string, or the prefix is below the floor.
 */
export function placeHistoryCacheBreakpoint(
  messages: ChatMessages[],
  systemStatic: string,
  offsetFromEnd: number,
  cacheMinTokens: number,
): ChatMessages[] {
  const targetIdx = messages.length - 1 - offsetFromEnd;
  if (targetIdx < 0) {
    return messages;
  }
  const target = messages.at(targetIdx);
  if (target === undefined || typeof target.content !== "string") {
    return messages;
  }
  let prefixTokens = estimateTokens(systemStatic);
  for (const message of messages.slice(0, targetIdx + 1)) {
    if (typeof message.content === "string") {
      prefixTokens += estimateTokens(message.content);
    }
  }
  if (prefixTokens < cacheMinTokens) {
    return messages;
  }
  const replaced = messages.slice();
  replaced[targetIdx] = { ...target, content: [cacheControlBlock(target.content)] };
  return replaced;
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
  const isAnthropic = isAnthropicModel(req.model);
  const systemMessage = buildSystemMessage(req.systemPrompt, isAnthropic);
  const history =
    isAnthropic && req.api === "chat-completions" && req.historyCacheBreakpointFromEnd !== undefined
      ? placeHistoryCacheBreakpoint(
          buildHistoryMessages(req.history),
          req.systemPrompt.static,
          req.historyCacheBreakpointFromEnd,
          ANTHROPIC_CACHE_MIN_TOKENS,
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
  // Surface resolve-chat's dropped/ignored-knob notes as `warning` events (the mapper returns `events:[]`,
  // so they merge in here) and fire `onEvent` for each — never silently dropped.
  const warnings = warningEvents(resolved.warnings, deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
