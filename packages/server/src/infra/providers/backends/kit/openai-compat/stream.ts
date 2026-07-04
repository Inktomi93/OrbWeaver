// infra/providers/backends/kit/openai-compat/stream — the SHARED OpenAI chat-completions stream reducer +
// the view→ChatResult mapper + the raw-SSE line parser. THE ISOLATION SEAM: the openrouter and custom-byo
// (and any future OpenAI-compatible) backends import these DOWN, so no backend reaches into another's
// folder (strategy isolation). Pure of transport — driven in tests with a synthetic AsyncIterable.
//
// DETERMINISM: the mapper takes the settled-at time as an injected `now` value (no `Date.now()` here).

import type { ChatResult, ChatUsage, ToolCallInput } from "../../../contract";
import { normalizeFinishReason } from "../../../contract";
import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  ChatCompletionStreamDelta,
  ChatCompletionUsage,
  ChatMessageToolCall,
  ChatToolCallDelta,
} from "../wire-schemas";
import {
  collectReasoningDetailsText,
  extractChatReasoning,
  extractChatReply,
} from "../wire-schemas";

/** A streaming token delta the reducer emits. Minimal by design — NO `chatId` (the runner attaches its
 *  own id when forwarding to the domain's `ChatDeltaEvent` callback), keeping this helper free of the
 *  branded-id / contracts-chat coupling. */
export interface StreamDelta {
  readonly kind: "text" | "reasoning";
  readonly text: string;
}

/** Hooks the reducer pumps during the drain. */
export interface StreamReduceOptions {
  /** Per text/reasoning delta — drives live streaming to the caller. */
  readonly onDelta?: ((delta: StreamDelta) => void) | undefined;
  /** Once per received chunk (BEFORE any delta dispatch) so the caller can reset a rolling idle-timeout —
   *  fires even for chunks carrying no delta (the usage sentinel). */
  readonly onChunk?: (() => void) | undefined;
}

/** Context the view→ChatResult mapper needs that isn't on the wire view. */
export interface MapTurnContext {
  readonly model: string;
  /** Turn-start time (epoch-ms), injected by the runner. */
  readonly startedAt: number;
  /** Settle time (epoch-ms), injected by the runner — `durationApiMs = now - startedAt`. */
  readonly now: number;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  /** Accumulated streaming CoT; empty for the one-shot path (which reads `message.reasoning` instead). */
  readonly reasoning?: string | undefined;
}

/**
 * Drain a chat.completions streaming response into the assembled {@link ChatCompletionResult} view. Each
 * chunk: `delta.content` → reply; `delta.reasoning` / `delta.reasoningDetails` → CoT (structured channel
 * preferred — newer Anthropic routes populate both, and reading both doubles the text); `chunk.error` →
 * an in-band provider error promoted to a throw (so the HTTP classifier handles it); `chunk.usage` +
 * `finishReason` → the terminal sentinel only.
 */
export async function reduceChatCompletionStream(
  stream: AsyncIterable<ChatCompletionStreamChunk>,
  opts: StreamReduceOptions = {},
): Promise<ChatCompletionResult> {
  let replyText = "";
  let usage: ChatCompletionUsage | undefined;
  let finishReason: string | null = null;
  const toolCalls = new Map<number, ToolCallAccumulator>();
  for await (const chunk of stream) {
    opts.onChunk?.();
    if (chunk.error !== null && chunk.error !== undefined) {
      // Promote to a thrown error carrying the code so `providerErrorFromHttp` classifies it via the
      // shared HTTP path (an OpenAI-compatible stream can embed billing/rate-limit errors mid-stream).
      throw Object.assign(new Error(chunk.error.message), { statusCode: chunk.error.code });
    }
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

// ── The D48 tool-call delta accumulator (tool-use-design/02 §6 — ST's proven index-keyed model) ────
// The JSON `arguments` arrive SLICED MID-TOKEN across fragments; only string concatenation is correct
// (never an incremental JSON parse). `id`/`name` LATCH on first sight — later fragments repeat or omit
// them. NO per-fragment delta events reach the caller (03 §5): tool fragments are protocol, not prose.
interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

function accumulateToolCallDeltas(
  acc: Map<number, ToolCallAccumulator>,
  fragments: readonly ChatToolCallDelta[] | undefined,
): void {
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

// Emission order = ascending wire index (deterministic — the loop executes in emission order, 02 §7).
function assembleToolCalls(acc: Map<number, ToolCallAccumulator>): ChatMessageToolCall[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => ({
      id: entry.id,
      function: { name: entry.name, arguments: entry.arguments },
    }));
}

// Emit the text + reasoning deltas for one chunk and return the reply text it appended (kept separate so
// the reducer stays under the cognitive-complexity gate). Reasoning channel selection: the structured
// `reasoningDetails` wins when it carries text (newer Anthropic routes populate both channels for the same
// CoT — reading both would double it); the legacy `reasoning` string is the fallback.
function dispatchDelta(
  delta: ChatCompletionStreamDelta,
  onDelta: ((delta: StreamDelta) => void) | undefined,
): string {
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

// Map the lenient wire usage → the cross-backend `ChatUsage`. The 5m/1h cache split is Anthropic/SDK
// -internal — the chat-completions path can't report it (→ null).
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
    webSearchRequests: 0, // chat-completions path has no tool-call reporting
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

/**
 * Map an assembled chat-completions view → the cross-backend {@link ChatResult}. Pure of IO (the catalog
 * lookups are the caller's job — `contextWindow`/`maxOutputTokens` are passed in). The streaming path
 * supplies accumulated `ctx.reasoning`; the one-shot path leaves it empty and the mapper falls back to the
 * view's `message.reasoning`. No `sessionId` — OpenAI-compatible runners have no SDK session.
 */
export function mapChatCompletionToTurnResult(
  view: ChatCompletionResult,
  ctx: MapTurnContext,
): ChatResult {
  const chatFinish = view.choices?.[0]?.finishReason ?? null;
  const reasoning =
    ctx.reasoning !== undefined && ctx.reasoning.length > 0
      ? ctx.reasoning
      : extractChatReasoning(view);
  const toolCalls = mapToolCalls(view.choices?.[0]?.message?.toolCalls);
  return {
    reply: extractChatReply(view),
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    reasoning,
    stopReason: chatFinish,
    terminalReason: null,
    finishReason: normalizeFinishReason(chatFinish),
    ttftMs: null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    usage: mapUsage(view, ctx),
    events: [],
    rateLimit: null,
  };
}

// Wire tool-calls → the contract's ToolCallInput (absent, never [], on a tool-less turn — the T4 loop
// pivots on `finishReason === "tool"` and reads these; 03 §2).
function mapToolCalls(
  calls: readonly ChatMessageToolCall[] | undefined,
): readonly ToolCallInput[] | undefined {
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

// File-local: classify one SSE line. A `data:` line carries a JSON payload (yielded as raw `unknown`);
// the literal `[DONE]` ends the stream; everything else (comments, `event:`, blanks, non-JSON keepalives)
// is skipped.
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
    return { kind: "skip" }; // partial flush / non-JSON keepalive — never throw
  }
}

/**
 * Parse an OpenAI-style `text/event-stream` body into the raw JSON payloads (one per `data:` line). Yields
 * `unknown` — the RUNNER reshapes each payload into a {@link ChatCompletionStreamChunk} (a standard mapper
 * or the custom-byo response-map) before feeding {@link reduceChatCompletionStream}. (The OpenRouter path
 * uses the SDK's own SSE handling; this exists for the raw-fetch backends.)
 */
export async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a streaming read is inherently sequential — each chunk must be awaited before the next arrives.
      const { done, value } = await reader.read();
      if (done) {
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
