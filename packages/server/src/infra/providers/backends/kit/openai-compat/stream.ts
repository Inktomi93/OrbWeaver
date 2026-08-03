// The shared OpenAI chat-completions stream reducer + view→ChatResult mapper + raw-SSE line parser.
// Isolation seam: openrouter/custom-byo (and any future OpenAI-compatible backend) import these down.

import type { ChatResult, ChatUsage, ToolCallInput } from "../../../contract/index.ts";
import { normalizeFinishReason } from "../../../contract/index.ts";
import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  ChatCompletionStreamDelta,
  ChatCompletionUsage,
  ChatMessageToolCall,
  ChatToolCallDelta,
} from "../wire-schemas.ts";
import { collectReasoningDetailsText, extractChatReasoning, extractChatReply } from "../wire-schemas.ts";

export interface StreamDelta {
  readonly kind: "text" | "reasoning";
  readonly text: string;
}

export interface StreamReduceOptions {
  readonly onDelta?: ((delta: StreamDelta) => void) | undefined;
  /** Fires once per received chunk, before any delta dispatch — even for a chunk with no delta. */
  readonly onChunk?: (() => void) | undefined;
}

export interface MapTurnContext {
  readonly model: string;
  readonly startedAt: number;
  readonly now: number;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly reasoning?: string | undefined;
}

/** Latch the generation handle (`gen-…`) on first non-empty sight; every chunk repeats the same id. */
function latchGenerationId(current: string | undefined, chunkId: string | undefined): string | undefined {
  if (current !== undefined) {
    return current;
  }
  return chunkId !== undefined && chunkId.length > 0 ? chunkId : undefined;
}

export async function reduceChatCompletionStream(
  stream: AsyncIterable<ChatCompletionStreamChunk>,
  opts: StreamReduceOptions = {},
): Promise<ChatCompletionResult> {
  let replyText = "";
  let usage: ChatCompletionUsage | undefined;
  let finishReason: string | null = null;
  // The generation handle (`gen-…`) — identical on every chunk; latch it once for the PD-137 cost key.
  let generationId: string | undefined;
  const toolCalls = new Map<number, ToolCallAccumulator>();
  for await (const chunk of stream) {
    opts.onChunk?.();
    if (chunk.error !== null && chunk.error !== undefined) {
      throw Object.assign(new Error(chunk.error.message), { statusCode: chunk.error.code });
    }
    generationId = latchGenerationId(generationId, chunk.id);
    const delta = chunk.choices[0]?.delta;
    if (delta !== undefined) {
      replyText += dispatchDelta(delta, opts.onDelta);
      accumulateToolCallDeltas(toolCalls, delta.toolCalls);
    }
    if (chunk.usage !== undefined) {
      usage = chunk.usage;
    }
    const chunkFinish = chunk.choices[0]?.finishReason;
    if (chunkFinish !== null && chunkFinish !== undefined && chunkFinish.length > 0) {
      finishReason = chunkFinish;
    }
  }
  const assembled = assembleToolCalls(toolCalls);
  return {
    ...(generationId !== undefined ? { id: generationId } : {}),
    choices: [
      {
        message: {
          content: replyText,
          ...(assembled.length > 0 ? { toolCalls: assembled } : {}),
        },
        finishReason,
      },
    ],
    ...(usage !== undefined ? { usage } : {}),
  };
}

// `arguments` arrive sliced mid-token across fragments — only string concatenation is correct (never an
// incremental JSON parse). `id`/`name` latch on first sight.
interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

function accumulateToolCallDeltas(acc: Map<number, ToolCallAccumulator>, fragments: readonly ChatToolCallDelta[] | undefined): void {
  if (fragments === undefined) {
    return;
  }
  for (const fragment of fragments) {
    const entry = acc.get(fragment.index) ?? { id: "", name: "", arguments: "" };
    if (entry.id.length === 0 && fragment.id !== undefined) {
      entry.id = fragment.id;
    }
    if (entry.name.length === 0 && fragment.function?.name !== undefined) {
      entry.name = fragment.function.name;
    }
    if (fragment.function?.arguments !== undefined) {
      entry.arguments += fragment.function.arguments;
    }
    acc.set(fragment.index, entry);
  }
}

function assembleToolCalls(acc: Map<number, ToolCallAccumulator>): ChatMessageToolCall[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => ({
      id: entry.id,
      function: { name: entry.name, arguments: entry.arguments },
    }));
}

// `reasoningDetails` wins when it carries text (some routes populate both channels for the same CoT —
// reading both would double it); the legacy `reasoning` string is the fallback.
function dispatchDelta(delta: ChatCompletionStreamDelta, onDelta: ((delta: StreamDelta) => void) | undefined): string {
  let appended = "";
  if (typeof delta.content === "string" && delta.content.length > 0) {
    appended = delta.content;
    onDelta?.({ kind: "text", text: delta.content });
  }
  const detailsText = collectReasoningDetailsText(delta.reasoningDetails);
  if (detailsText.length > 0) {
    onDelta?.({ kind: "reasoning", text: detailsText });
  } else if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
    onDelta?.({ kind: "reasoning", text: delta.reasoning });
  }
  return appended;
}

// 5m/1h cache split is Anthropic/SDK-internal — chat-completions can't report it.
function mapUsage(view: ChatCompletionResult, ctx: MapTurnContext): ChatUsage {
  const u = view.usage;
  const cd = u?.costDetails;
  return {
    model: ctx.model,
    tokensIn: u?.promptTokens ?? 0,
    tokensOut: u?.completionTokens ?? 0,
    cacheReadTokens: u?.promptTokensDetails?.cachedTokens ?? 0,
    cacheWriteTokens: u?.promptTokensDetails?.cacheWriteTokens ?? 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    reasoningTokens: u?.completionTokensDetails?.reasoningTokens ?? null,
    contextWindow: ctx.contextWindow,
    maxOutputTokens: ctx.maxOutputTokens,
    webSearchRequests: 0,
    costUsd: u?.cost ?? 0,
    costDetails:
      cd !== null && cd !== undefined
        ? {
            totalUsd: cd.upstreamInferenceCost ?? 0,
            promptUsd: cd.upstreamInferencePromptCost ?? 0,
            completionUsd: cd.upstreamInferenceCompletionsCost ?? 0,
          }
        : null,
    isByok: u?.isByok ?? null,
  };
}

export function mapChatCompletionToTurnResult(view: ChatCompletionResult, ctx: MapTurnContext): ChatResult {
  const chatFinish = view.choices?.[0]?.finishReason ?? null;
  const reasoning = ctx.reasoning !== undefined && ctx.reasoning.length > 0 ? ctx.reasoning : extractChatReasoning(view);
  const toolCalls = mapToolCalls(view.choices?.[0]?.message?.toolCalls);
  return {
    reply: extractChatReply(view),
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    reasoning,
    reasoningRedacted: false,
    stopReason: chatFinish,
    terminalReason: null,
    finishReason: normalizeFinishReason(chatFinish),
    ttftMs: null,
    warmSpareClaimed: null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    ...(view.id !== undefined ? { generationId: view.id } : {}),
    usage: mapUsage(view, ctx),
    events: [],
    rateLimit: null,
  };
}

function mapToolCalls(calls: readonly ChatMessageToolCall[] | undefined): readonly ToolCallInput[] | undefined {
  if (calls === undefined || calls.length === 0) {
    return;
  }
  return calls.map((call) => ({
    toolCallId: call.id,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
}

const SSE_DATA_PREFIX = "data:";
const SSE_DONE = "[DONE]";

function parseSseLine(line: string): { kind: "data"; value: unknown } | { kind: "done" | "skip" } {
  if (!line.startsWith(SSE_DATA_PREFIX)) {
    return { kind: "skip" };
  }
  const payload = line.slice(SSE_DATA_PREFIX.length).trim();
  if (payload === SSE_DONE) {
    return { kind: "done" };
  }
  try {
    return { kind: "data", value: JSON.parse(payload) };
  } catch {
    return { kind: "skip" };
  }
}

export async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a streaming read is inherently sequential — each chunk must be awaited before the next arrives.
      const { done, value } = await reader.read();
      if (done) {
        // Flush a final `data:` line the server never newline-terminated (spec-sloppy BYO endpoints).
        const tail = parseSseLine(buffer.trim());
        if (tail.kind === "data") {
          yield tail.value;
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        const parsed = parseSseLine(line);
        if (parsed.kind === "done") {
          return;
        }
        if (parsed.kind === "data") {
          yield parsed.value;
        }
        newlineIdx = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
