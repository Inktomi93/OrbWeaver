// One chat turn over OpenRouter's `beta.responses.send` (the Responses API). Carries its own stream
// reducer + view→ChatResult mapper since the Responses event/usage shapes differ from chat-completions.

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
import type { Verbosity } from "@orb/contracts/connection";
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
  emitSamplingReceipt,
  isMandatoryReasoningRejection,
  joinSystemPrompt,
  mergeCustomParameters,
  resolveFallbackModels,
  resolveProviderPreferences,
  warningEvents,
} from "./shared";

const USER_ROLE = "user";
const REASONING_OFF = "none";
const REASONING_SUMMARY = "auto";
// Prepended when the assembled view starts with an assistant message — the Responses API rejects that.
const ASSISTANT_FIRST_PLACEHOLDER = "";
const PROMPT_CACHE_KEY_LEN = 32;

const TERMINAL_TYPES = new Set(["response.completed", "response.incomplete"]);

interface OpenRouterResponsesClient {
  readonly beta: {
    readonly responses: {
      readonly send: (request: { readonly responsesRequest: ResponsesRequest }, options?: { readonly signal?: AbortSignal }) => Promise<unknown>;
    };
  };
}

type ResponsesInputItem = EasyInputMessage | FunctionCallItem | FunctionCallOutputItem;

// A `tool-call` part becomes a `function_call` item keyed by `callId`; `tool-result` becomes
// `function_call_output`.
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

// `EasyInputMessage` carries no per-participant `name`, so the completion-name label is dropped here.
function buildResponsesInput(history: readonly ChatHistoryMessage[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  for (const turn of history) {
    const exchange = toolExchangeItems(turn.content);
    if (exchange.length > 0) {
      items.push(...exchange);
    }
    if (turn.role === "tool") {
      continue;
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

// The ONE OR wire that carries a verbosity field; emits `format`/`verbosity` only when set, else undefined
// (keeps a plain turn from emitting an empty `text: {}`).
function buildResponsesText(format: ResponseFormat | undefined, verbosity: Verbosity | undefined): ResponsesRequest["text"] {
  if (format === undefined && verbosity === undefined) {
    return;
  }
  return {
    ...(format !== undefined
      ? {
          format: {
            type: "json_schema",
            name: format.name,
            schema: { ...format.schema },
            strict: format.strict ?? true,
            ...(format.description !== undefined ? { description: format.description } : {}),
          },
        }
      : {}),
    ...(verbosity !== undefined ? { verbosity } : {}),
  };
}

function promptCacheKey(model: string, instructions: string): string {
  return createHash("sha1").update(`${model} ${instructions}`).digest("hex").slice(0, PROMPT_CACHE_KEY_LEN);
}

// The tool-calling wire fields — SEMANTICALLY IDENTICAL to the chat-completions runner: `tools` and
// `toolChoice` are each emitted INDEPENDENTLY when set; `parallelToolCalls` rides only alongside a tools[]
// request (a bare flag is ignored/rejected upstream).
function responsesToolFields(req: OpenRouterChatRequest): Partial<ResponsesRequest> {
  const parallel = req.params.advanced?.parallelToolCalls;
  return {
    ...(req.tools !== undefined ? { tools: buildResponsesTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { toolChoice: buildResponsesToolChoice(req.toolChoice) } : {}),
    ...(req.tools !== undefined && parallel !== undefined ? { parallelToolCalls: parallel } : {}),
  };
}

// `includeReasoning` is false on the mandatory-reasoning replay.
function buildResponsesBody(req: OpenRouterChatRequest, resolved: ResolvedChatKnobs, includeReasoning: boolean): ResponsesRequest {
  const isAnthropic = isAnthropicModel(req.model);
  const instructions = joinSystemPrompt(req.systemPrompt);
  const provider = resolveProviderPreferences(req.model, req.providerRouting);
  const fallbackModels = resolveFallbackModels(req.providerRouting);
  const reasoningBlock = effortToResponsesReasoning(buildReasoningRequest(resolved.reasoning));
  const text = buildResponsesText(req.responseFormat, resolved.verbosity);
  const owned: ResponsesRequest = {
    model: req.model,
    input: buildResponsesInput(req.history),
    stream: true,
    ...(fallbackModels !== undefined ? { models: fallbackModels } : {}),
    ...(instructions.length > 0 ? { instructions } : {}),
    // Anthropic cacheControl is a measured no-op here (stripped by the Responses→Messages wrap); kept for
    // forward-compat. Non-Anthropic routes get the sticky promptCacheKey instead.
    ...(isAnthropic && instructions.length > 0 ? { cacheControl: ANTHROPIC_CACHE_5M } : {}),
    ...(!isAnthropic && instructions.length > 0 ? { promptCacheKey: promptCacheKey(req.model, instructions) } : {}),
    ...(resolved.sampling.temperature !== undefined ? { temperature: resolved.sampling.temperature } : {}),
    ...(resolved.sampling.topP !== undefined ? { topP: resolved.sampling.topP } : {}),
    ...(resolved.sampling.topK !== undefined ? { topK: resolved.sampling.topK } : {}),
    ...(resolved.maxOutputTokens !== undefined ? { maxOutputTokens: resolved.maxOutputTokens } : {}),
    ...(includeReasoning ? { reasoning: { ...reasoningBlock, summary: REASONING_SUMMARY } } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...responsesToolFields(req),
    ...(text !== undefined ? { text } : {}),
    plugins: withContextCompressionPlugin(req.params),
  };
  return mergeCustomParameters(owned, req.customParameters);
}

interface ResponsesDrain {
  readonly reply: string;
  readonly reasoning: string;
  readonly final: OpenResponsesResult | undefined;
}

// No `statusCode` attached (Responses errors carry a string code, not an HTTP status); classification
// falls back to the transport-name table.
function throwResponsesError(message: string): never {
  throw new Error(message);
}

function readResponsesEvent(event: StreamEvents): {
  readonly text?: string;
  readonly reasoning?: string;
  readonly final?: OpenResponsesResult;
} {
  if (event.type === "response.output_text.delta") {
    return { text: event.delta };
  }
  if (event.type === "response.reasoning_text.delta" || event.type === "response.reasoning_summary_text.delta") {
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
    cacheReadTokens: u?.inputTokensDetails.cachedTokens ?? 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    reasoningTokens: u?.outputTokensDetails.reasoningTokens ?? null,
    contextWindow: ctx.contextWindow,
    maxOutputTokens: ctx.maxOutputTokens,
    webSearchRequests: 0,
    costUsd: u?.cost ?? 0,
    costDetails:
      cd !== undefined
        ? {
            totalUsd: cd.upstreamInferenceCost ?? 0,
            promptUsd: cd.upstreamInferenceInputCost,
            completionUsd: cd.upstreamInferenceOutputCost,
          }
        : null,
    isByok: u?.isByok ?? null,
  };
}

// Fallback when the streamed deltas were empty: join text parts of every `message`-type output item.
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

// `function_call` items on the terminal response carry FULL arguments — no fragment reassembly needed.
function extractResponsesToolCalls(final: OpenResponsesResult | undefined): readonly ToolCallInput[] | undefined {
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
    reasoningRedacted: false,
    stopReason: rawFinish,
    terminalReason: null,
    finishReason: normalizeFinishReason(rawFinish),
    ttftMs: null,
    warmSpareClaimed: null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    usage: mapResponsesUsage(final, ctx),
    events: [],
    rateLimit: null,
  };
}

function isEventStream(value: unknown): value is AsyncIterable<StreamEvents> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function errorPrefix(model: string): string {
  return `openrouter responses (${model})`;
}

// `markCommitted` fires on the first text/reasoning delta so a retry can't replay tokens.
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
    const result = await client.beta.responses.send({ responsesRequest: body }, { signal: idle.signal });
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

/** Runs one Responses-API turn, incl. the mandatory-reasoning strip-and-replay-once fallback. */
export async function runResponsesTurn(client: OpenRouterResponsesClient, req: OpenRouterChatRequest, deps: OpenRouterChatDeps): Promise<ChatResult> {
  const startedAt = deps.now();
  const retryOpts = {
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
    now: deps.now,
    ...(deps.random !== undefined ? { random: deps.random } : {}),
  };
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
      (err): ProviderError => (err instanceof ProviderError ? err : providerErrorFromHttp(err, errorPrefix(req.model))),
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
  emitSamplingReceipt(req.params, resolved);
  const warnings = warningEvents(resolved.warnings, deps.now());
  for (const event of warnings) {
    req.onEvent?.(event);
  }
  return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
}
