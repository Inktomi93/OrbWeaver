// The shared OpenAI chat-completions stream reducer + view→ChatResult mapper + raw-SSE line parser.
// Isolation seam: openrouter/custom-byo (and any future OpenAI-compatible backend) import these down.

import type { ChatResult, ChatUsage, ToolCallInput } from "../../../contract/index.ts";
import { normalizeFinishReason, ProviderError } from "../../../contract/index.ts";
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

/** The `terminalReason` a truncated (finish-reason-less) OpenAI-compatible turn is classified under — the
 *  same string the agent-sdk reducer stamps, so one debug filter finds every truncated turn (#1400). */
const TRUNCATED_TERMINAL_REASON = "stream_truncated";

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
  // TRUNCATION FAILS CLOSED (#1400). `finish_reason` is the chat-completions terminal: the last chunk of a
  // completed generation carries one (`stop`/`length`/`tool_calls`/…), and a provider, proxy or transport that
  // emits deltas and then simply CLOSES carries none. Returning the accumulated text anyway produced a normal
  // success whose `finishReason` was null — which the engine commits as a finished reply, indistinguishable
  // downstream from a short one. A turn with no terminal is a retryable provider fault instead.
  if (finishReason === null) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: "OpenAI-compatible response carried no finish reason — the stream ended before the turn terminated (truncated turn)",
      terminalReason: TRUNCATED_TERMINAL_REASON,
    });
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
    tokensIn: u?.promptTokens ?? null,
    tokensOut: u?.completionTokens ?? null,
    cacheReadTokens: u?.promptTokensDetails?.cachedTokens ?? 0,
    cacheWriteTokens: u?.promptTokensDetails?.cacheWriteTokens ?? 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    reasoningTokens: u?.completionTokensDetails?.reasoningTokens ?? null,
    contextWindow: ctx.contextWindow,
    maxOutputTokens: ctx.maxOutputTokens,
    webSearchRequests: 0,
    costUsd: u?.cost ?? null,
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
const SSE_BUFFER_LIMIT = 1_048_576;
const SSE_ERROR_PAYLOAD_PREVIEW = 200;

function truncateSsePayload(payload: string): string {
  return payload.length > SSE_ERROR_PAYLOAD_PREVIEW ? `${payload.slice(0, SSE_ERROR_PAYLOAD_PREVIEW)}…` : payload;
}

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
  } catch (cause) {
    // #758: a malformed `data:` payload can carry content/error/terminal semantics — silently dropping
    // it let the reducer return a partial/empty ChatResult as a SUCCESS. Blank lines, SSE comments, and
    // non-data fields stay skippable above (that arm is untouched); only a RESULT-BEARING `data:` line
    // that fails to parse is a protocol error the caller must see.
    throw new Error(`OpenAI-compatible SSE data payload was not valid JSON: ${truncateSsePayload(payload)}`, { cause });
  }
}

function assertSseLineBound(line: string): void {
  if (line.length > SSE_BUFFER_LIMIT) {
    throw new Error(`OpenAI-compatible SSE line exceeded the ${SSE_BUFFER_LIMIT}-character limit`);
  }
}

function decodeSseChunk(buffer: string, value: Uint8Array, decoder: TextDecoder): { buffer: string; lines: string[] } {
  const lines: string[] = [];
  let offset = 0;
  let pending = buffer;
  while (offset < value.byteLength) {
    const take = Math.min(value.byteLength - offset, SSE_BUFFER_LIMIT - pending.length + 1);
    pending += decoder.decode(value.subarray(offset, offset + take), { stream: true });
    offset += take;
    const complete = pending.split("\n");
    pending = complete.pop() ?? "";
    for (const line of complete) {
      assertSseLineBound(line);
      lines.push(line.trim());
    }
    assertSseLineBound(pending);
  }
  return { buffer: pending, lines };
}

export async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush a final `data:` line the server never newline-terminated (spec-sloppy BYO endpoints).
        const tail = parseSseLine(buffer.trim());
        if (tail.kind === "data") {
          yield tail.value;
        }
        break;
      }
      const decoded = decodeSseChunk(buffer, value, decoder);
      buffer = decoded.buffer;
      for (const line of decoded.lines) {
        const parsed = parseSseLine(line);
        if (parsed.kind === "done") {
          return;
        }
        if (parsed.kind === "data") {
          yield parsed.value;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
