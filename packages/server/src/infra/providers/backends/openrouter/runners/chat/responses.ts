// infra/providers/backends/openrouter/runners/chat/responses — ONE chat turn over OpenRouter's
// `beta.responses.send` (the Responses API). The kit's reducer/mapper are chat-completions-shaped, so this
// runner carries its OWN stream reducer + view→ChatResult mapper for the Responses event/usage shapes.
// Owns: the input assembly (assistant-first guard), the effort×maxTokens XOR (via the kit builder), the
// top-level cacheControl (a measured no-op kept for forward-compat — guaranteed Anthropic caching uses
// chat-completions, Esoteric §5), the promptCacheKey for OpenAI-route sticky caching, the pre-commit retry,
// and the mandatory-reasoning strip-and-replay-ONCE. Imports `backends/kit` DOWN; never a sibling backend.

import { createHash } from "node:crypto";
import type {
  EasyInputMessage,
  FunctionCallItem,
  FunctionCallOutputItem,
  OpenAIResponsesToolChoiceUnion,
  OpenResponsesResult,
  ResponsesRequest,
  ResponsesRequestToolFunction,
  StreamEvents,
} from "@openrouter/sdk/models";
import type { ChatContentPart } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  ChatHistoryMessage,
  ChatResult,
  ChatUsage,
  OpenRouterChatRequest,
  ResolvedChatKnobs,
  ResponseFormat,
  ToolCallInput,
  ToolChoice,
  WireTool,
} from "../../../../contract";
import { normalizeFinishReason, ProviderError } from "../../../../contract";
import { resolveChat } from "../../../../resolve-chat";
import {
  ANTHROPIC_CACHE_5M,
  chatHistoryText,
  effortToResponsesReasoning,
  isAnthropicModel,
  providerErrorFromHttp,
  runWithPreCommitRetry,
  turnAbortSignal,
} from "../../../kit";
import { withContextCompressionPlugin } from "./context-compression";
import type { OpenRouterChatDeps } from "./shared";
import {
  buildReasoningRequest,
  isMandatoryReasoningRejection,
  joinSystemPrompt,
  mergeCustomParameters,
  resolveProviderPreferences,
  warningEvents,
} from "./shared";

const USER_ROLE = "user";
const REASONING_OFF = "none";
const REASONING_SUMMARY = "auto";
// A placeholder user turn prepended when the assembled view starts with an assistant message — the
// Responses API rejects an assistant-first input. Empty content keeps it inert.
const ASSISTANT_FIRST_PLACEHOLDER = "";
// Stable per-(model, instructions) cache key for OpenAI-route prompt caching (Anthropic uses cacheControl
// instead). SHA-1 is a non-cryptographic content hash here; sliced to OpenRouter's key budget.
const PROMPT_CACHE_KEY_LEN = 32;

// The terminal Responses statuses that carry a final usage-bearing `response` object.
const TERMINAL_TYPES = new Set(["response.completed", "response.incomplete"]);

// The structural slice this runner needs off the client port (small param type per useMaxParams).
interface OpenRouterResponsesClient {
  readonly beta: {
    readonly responses: {
      readonly send: (
        request: { readonly responsesRequest: ResponsesRequest },
        options?: { readonly signal?: AbortSignal },
      ) => Promise<unknown>;
    };
  };
}

// One Responses input item (the D48/T2 union this runner emits: plain messages + the tool exchange).
type ResponsesInputItem = EasyInputMessage | FunctionCallItem | FunctionCallOutputItem;

// The materialized tool exchange → responses-dialect items: an assistant `tool-call` part becomes a
// `function_call` item (the input replay reuses `toolCallId` for the item `id` — OpenRouter accepts a
// replayed call keyed by `callId`); a `tool-result` part becomes a `function_call_output` item.
function toolExchangeItems(content: readonly ChatContentPart[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  for (const part of content) {
    if (part.type === "tool-call") {
      items.push({
        type: "function_call",
        id: part.toolCallId,
        callId: part.toolCallId,
        name: part.name,
        arguments: part.arguments,
      });
    } else if (part.type === "tool-result") {
      items.push({ type: "function_call_output", callId: part.toolCallId, output: part.content });
    }
  }
  return items;
}

// Assemble the Responses `input` from the assembled view. The SDK's `EasyInputMessage` carries no per-
// participant `name` (unlike chat-completions), so the completion-name label is dropped on this path — see
// the FLAG in index.ts. An assistant-first view gets a placeholder user turn prepended. A materialized
// tool exchange (D48/T2) rides as `function_call`/`function_call_output` items in turn order.
function buildResponsesInput(history: readonly ChatHistoryMessage[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  for (const turn of history) {
    const exchange = toolExchangeItems(turn.content);
    if (exchange.length > 0) {
      items.push(...exchange);
    }
    if (turn.role === "tool") {
      continue; // its results already rode above; a tool turn has no message body
    }
    const text = chatHistoryText(turn.content);
    if (text.trim().length === 0) {
      continue;
    }
    items.push({ role: turn.role, content: text });
  }
  const first = items[0];
  if (first !== undefined && "role" in first && first.role === "assistant") {
    items.unshift({ role: USER_ROLE, content: ASSISTANT_FIRST_PLACEHOLDER });
  }
  return items;
}

// ── The D48 request-field builders (responses dialect — flat tools, responses toolChoice spelling) ──
function buildResponsesTools(tools: readonly WireTool[]): ResponsesRequestToolFunction[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: { ...tool.parameters },
  }));
}

function buildResponsesToolChoice(choice: ToolChoice): OpenAIResponsesToolChoiceUnion {
  if (choice.mode === "tool") {
    return { type: "function", name: choice.name };
  }
  return choice.mode;
}

// `responseFormat` → the responses `text.format` json_schema spelling (tool-use-design/04 §3).
function buildResponsesTextFormat(format: ResponseFormat): ResponsesRequest["text"] {
  return {
    format: {
      type: "json_schema",
      name: format.name,
      schema: { ...format.schema },
      strict: format.strict ?? true,
      ...(format.description !== undefined ? { description: format.description } : {}),
    },
  };
}

function promptCacheKey(model: string, instructions: string): string {
  return createHash("sha1")
    .update(`${model} ${instructions}`)
    .digest("hex")
    .slice(0, PROMPT_CACHE_KEY_LEN);
}

// Build the typed Responses body from the capability-RESOLVED knobs (`resolve-chat` gated sampling/
// reasoning/output upstream). `includeReasoning` is false on the mandatory-reasoning replay. The reasoning
// block carries the XOR-enforced effort|maxTokens (the kit builder) plus a `summary:"auto"`.
function buildResponsesBody(
  req: OpenRouterChatRequest,
  resolved: ResolvedChatKnobs,
  includeReasoning: boolean,
): ResponsesRequest {
  const isAnthropic = isAnthropicModel(req.model);
  const instructions = joinSystemPrompt(req.systemPrompt);
  const provider = resolveProviderPreferences(req.model, req.providerRouting);
  const reasoningBlock = effortToResponsesReasoning(buildReasoningRequest(resolved.reasoning));
  const owned: ResponsesRequest = {
    model: req.model,
    input: buildResponsesInput(req.history),
    stream: true,
    ...(instructions.length > 0 ? { instructions } : {}),
    // Top-level Anthropic cacheControl: a measured no-op (stripped by the Responses→Messages wrap) kept
    // for forward-compat; non-Anthropic routes get the sticky promptCacheKey instead.
    ...(isAnthropic && instructions.length > 0 ? { cacheControl: ANTHROPIC_CACHE_5M } : {}),
    ...(!isAnthropic && instructions.length > 0
      ? { promptCacheKey: promptCacheKey(req.model, instructions) }
      : {}),
    ...(resolved.sampling.temperature !== undefined
      ? { temperature: resolved.sampling.temperature }
      : {}),
    ...(resolved.sampling.topP !== undefined ? { topP: resolved.sampling.topP } : {}),
    ...(resolved.maxOutputTokens !== undefined
      ? { maxOutputTokens: resolved.maxOutputTokens }
      : {}),
    ...(includeReasoning ? { reasoning: { ...reasoningBlock, summary: REASONING_SUMMARY } } : {}),
    ...(provider !== undefined ? { provider } : {}),
    // D48/T2: absent means ABSENT (byte-identical pre-D48 request without tools/format); the `auto`
    // toolChoice default is the CALLER's, never hardwired here.
    ...(req.tools !== undefined ? { tools: buildResponsesTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined
      ? { toolChoice: buildResponsesToolChoice(req.toolChoice) }
      : {}),
    ...(req.responseFormat !== undefined
      ? { text: buildResponsesTextFormat(req.responseFormat) }
      : {}),
    plugins: withContextCompressionPlugin(req.params),
  };
  return mergeCustomParameters(owned, req.customParameters);
}

// ── Stream reduce (Responses event shapes) ─────────────────────────────────────────────────────────
interface ResponsesDrain {
  readonly reply: string;
  readonly reasoning: string;
  readonly final: OpenResponsesResult | undefined;
}

// Promote a terminal failure/error event to a thrown Error the HTTP classifier handles. The Responses
// error `code` is a string enum (not an HTTP status), so no `statusCode` is attached — classification
// falls back to the transport-name table.
function throwResponsesError(message: string): never {
  throw new Error(message);
}

// One streamed event → its effect on the accumulator (kept tiny so the reducer stays under the
// cognitive-complexity gate). Returns the text/reasoning delta and/or the terminal response.
function readResponsesEvent(event: StreamEvents): {
  readonly text?: string;
  readonly reasoning?: string;
  readonly final?: OpenResponsesResult;
} {
  if (event.type === "response.output_text.delta") {
    return { text: event.delta };
  }
  if (
    event.type === "response.reasoning_text.delta" ||
    event.type === "response.reasoning_summary_text.delta"
  ) {
    return { reasoning: event.delta };
  }
  if (TERMINAL_TYPES.has(event.type) && "response" in event) {
    return { final: event.response };
  }
  if (event.type === "response.failed" && "response" in event) {
    const failure = event.response.error;
    throwResponsesError(failure === null ? "openrouter responses: failed" : failure.message);
  }
  if (event.type === "error") {
    throwResponsesError(event.message);
  }
  return {};
}

async function reduceResponsesStream(
  stream: AsyncIterable<StreamEvents>,
  opts: {
    readonly onChunk: () => void;
    readonly onText: (text: string) => void;
    readonly onReasoning: (text: string) => void;
  },
): Promise<ResponsesDrain> {
  let reply = "";
  let reasoning = "";
  let final: OpenResponsesResult | undefined;
  for await (const event of stream) {
    opts.onChunk();
    const effect = readResponsesEvent(event);
    if (effect.text !== undefined) {
      reply += effect.text;
      opts.onText(effect.text);
    }
    if (effect.reasoning !== undefined) {
      reasoning += effect.reasoning;
      opts.onReasoning(effect.reasoning);
    }
    if (effect.final !== undefined) {
      final = effect.final;
    }
  }
  return { reply, reasoning, final };
}

// ── View → ChatResult ──────────────────────────────────────────────────────────────────────────────
function mapResponsesUsage(
  final: OpenResponsesResult | undefined,
  ctx: {
    readonly model: string;
    readonly contextWindow: number | null;
    readonly maxOutputTokens: number | null;
  },
): ChatUsage {
  const u = final?.usage;
  const cd = u?.costDetails;
  return {
    model: ctx.model,
    tokensIn: u?.inputTokens ?? 0,
    tokensOut: u?.outputTokens ?? 0,
    cacheReadTokens: u?.inputTokensDetails?.cachedTokens ?? 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    reasoningTokens: u?.outputTokensDetails?.reasoningTokens ?? null,
    contextWindow: ctx.contextWindow,
    maxOutputTokens: ctx.maxOutputTokens,
    webSearchRequests: 0,
    costUsd: u?.cost ?? 0,
    costDetails:
      cd !== null && cd !== undefined
        ? {
            totalUsd: cd.upstreamInferenceCost ?? 0,
            promptUsd: cd.upstreamInferenceInputCost,
            completionUsd: cd.upstreamInferenceOutputCost,
          }
        : null,
    isByok: u?.isByok ?? null,
  };
}

// Flatten the Responses `output[]` into reply text when the streamed deltas were empty (the one-shot
// fallback): join the text parts of every `message`-type output item.
function flattenResponsesOutput(final: OpenResponsesResult | undefined): string {
  if (final?.outputText !== undefined && final.outputText.length > 0) {
    return final.outputText;
  }
  let out = "";
  for (const item of final?.output ?? []) {
    if (item.type !== "message" || !("content" in item)) {
      continue;
    }
    for (const part of item.content) {
      if ("text" in part && typeof part.text === "string") {
        out += part.text;
      }
    }
  }
  return out;
}

// D48/T2: the completed calls off the TERMINAL response's `output[]` (`function_call` items carry the
// FULL arguments there — no fragment reassembly needed on this path; the `…arguments.delta` events are
// protocol noise the reducer deliberately ignores, 03 §5). Absent, never [], on a tool-less turn.
function extractResponsesToolCalls(
  final: OpenResponsesResult | undefined,
): readonly ToolCallInput[] | undefined {
  const calls: ToolCallInput[] = [];
  for (const item of final?.output ?? []) {
    if (item.type === "function_call" && "callId" in item) {
      calls.push({ toolCallId: item.callId, name: item.name, arguments: item.arguments });
    }
  }
  return calls.length > 0 ? calls : undefined;
}

function mapResponsesToTurnResult(
  drain: ResponsesDrain,
  ctx: {
    readonly model: string;
    readonly startedAt: number;
    readonly now: number;
    readonly contextWindow: number | null;
    readonly maxOutputTokens: number | null;
  },
): ChatResult {
  const { final } = drain;
  const rawFinish = final?.incompleteDetails?.reason ?? final?.status ?? null;
  const toolCalls = extractResponsesToolCalls(final);
  return {
    reply: drain.reply.length > 0 ? drain.reply : flattenResponsesOutput(final),
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    reasoning: drain.reasoning,
    stopReason: rawFinish,
    terminalReason: null,
    finishReason: normalizeFinishReason(rawFinish),
    ttftMs: null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    usage: mapResponsesUsage(final, ctx),
    events: [],
    rateLimit: null,
  };
}

// File-local guard: is the send result the streaming `EventStream` (an `AsyncIterable`)?
function isEventStream(value: unknown): value is AsyncIterable<StreamEvents> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function errorPrefix(model: string): string {
  return `openrouter responses (${model})`;
}

// One attempt: open the stream, drain it. Fresh idle-abort per attempt; `markCommitted` fires on the first
// text/reasoning delta so a retry can't replay tokens.
async function drainOnce(args: {
  readonly client: OpenRouterResponsesClient;
  readonly body: ResponsesRequest;
  readonly req: OpenRouterChatRequest;
  readonly markCommitted: () => void;
}): Promise<ResponsesDrain> {
  const { client, body, req, markCommitted } = args;
  const chatId = castId<ChatId>(req.chatId ?? "");
  const idle = turnAbortSignal(req.signal);
  try {
    const result = await client.beta.responses.send(
      { responsesRequest: body },
      { signal: idle.signal },
    );
    if (!isEventStream(result)) {
      throw new ProviderError({
        kind: "server",
        retryable: true,
        message: `${errorPrefix(req.model)}: expected a streaming response`,
      });
    }
    return await reduceResponsesStream(result, {
      onChunk: idle.reset,
      onText: (text): void => {
        markCommitted();
        req.onDelta?.({ chatId, kind: "text", text });
      },
      onReasoning: (text): void => {
        markCommitted();
        req.onDelta?.({ chatId, kind: "reasoning", text });
      },
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      throw err;
    }
    throw providerErrorFromHttp(err, errorPrefix(req.model));
  } finally {
    idle.dispose();
  }
}

/**
 * Run one Responses-API turn. Drives the pre-commit retry and the mandatory-reasoning strip-and-replay
 * (an `effort:"none"` request that 400s on a reasoning-required endpoint replays ONCE without the block —
 * pre-commit-safe). Maps the drained view → `ChatResult`.
 */
export async function runResponsesTurn(
  client: OpenRouterResponsesClient,
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
  const reasoningBlock = effortToResponsesReasoning(buildReasoningRequest(resolved.reasoning));
  const run = (includeReasoning: boolean): Promise<ResponsesDrain> =>
    runWithPreCommitRetry(
      (markCommitted) =>
        drainOnce({
          client,
          body: buildResponsesBody(req, resolved, includeReasoning),
          req,
          markCommitted,
        }),
      (err): ProviderError =>
        err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(req.model)),
      retryOpts,
    );

  let drain: ResponsesDrain;
  try {
    drain = await run(true);
  } catch (err) {
    if (reasoningBlock.effort === REASONING_OFF && isMandatoryReasoningRejection(err)) {
      drain = await run(false);
    } else {
      throw err;
    }
  }

  const turn = mapResponsesToTurnResult(drain, {
    model: req.model,
    startedAt,
    now: deps.now(),
    contextWindow: req.capability.context.window,
    maxOutputTokens: req.capability.output.maxTokens.max,
  });
  // Surface resolve-chat's dropped/ignored-knob notes as `warning` events (the mapper returns `events:[]`,
  // so they merge in here) and fire `onEvent` for each — never silently dropped.
  const warnings = warningEvents(resolved.warnings, deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
