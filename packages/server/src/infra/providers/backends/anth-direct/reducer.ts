// infra/providers/backends/anth-direct/reducer — drain the SDK's typed `Stream<RawMessageStreamEvent>`
// (the Anthropic SSE dialect the SDK parses ITSELF, part 02 §5e) into the accumulated turn shape the
// runner maps to `ChatResult`. Mirrors the OR runner's `reshapeChatStreamChunk`/`reduceChatCompletionStream`
// split, but over the Anthropic event union instead of the OpenAI SSE chunk.
//
// THE EVENT MODEL (messages.d.ts:944): message_start (carries the `Message` with initial `usage`) →
// N × [content_block_start (declares the block TYPE at an index) · content_block_delta (text_delta /
// thinking_delta / signature_delta) · content_block_stop] → message_delta (the terminal `stop_reason` +
// the OUTPUT-side `usage`) → message_stop. We track each open block's type by index so a `text_delta`
// routes to `reply` and a `thinking_delta` routes to `reasoning`; a `redacted_thinking` block sets the
// withheld flag (encrypted CoT — no visible text). `onDelta` fires per delta (kind:"text"|"reasoning").

import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ChatId } from "@orb/kit/ids";
import type { ChatDeltaEvent } from "../../contract";

/** The block dialects at a stream index — decides where a delta accumulates. `other` covers tool/server
 *  blocks anth-direct never requests (tool-less charter) but must not misroute if one ever appears. The
 *  axis is a tuple + derived type (§7.5 no-inline-union-redecl), file-local (not a cross-boundary shape). */
const BLOCK_KINDS = ["text", "thinking", "redacted_thinking", "other"] as const;
type BlockKind = (typeof BLOCK_KINDS)[number];

/** The reducer's accumulated terminal product — the runner maps this to `ChatResult`. Usage counts default
 *  to 0/absent so a stream that ends early still yields a coherent shape. */
export interface AnthReducedTurn {
  readonly reply: string;
  readonly reasoning: string;
  /** True when the model emitted a `redacted_thinking` block (thought, trace withheld). */
  readonly reasoningRedacted: boolean;
  /** The raw Anthropic `stop_reason` (`end_turn`/`max_tokens`/`stop_sequence`/`refusal`/…); `null` when the
   *  stream never delivered a `message_delta`. */
  readonly stopReason: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  /** ttft, ms since the injected `startedAt` — set on the FIRST text/thinking delta. `null` when the stream
   *  produced no visible delta. */
  readonly firstDeltaAt: number | null;
}

// The mutable accumulator threaded through the per-event handlers (kept file-local; the exported result is
// the readonly {@link AnthReducedTurn} projection).
interface Acc {
  reply: string;
  reasoning: string;
  reasoningRedacted: boolean;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheCreation5mTokens: number | null;
  cacheCreation1hTokens: number | null;
  firstDeltaAt: number | null;
  readonly blockKinds: Map<number, BlockKind>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

// File-local: read a numeric field off an unknown-shaped usage sub-object (the SDK types are stable, but
// the null-vs-absent per-field variance is real — coerce defensively). `null`/absent ⇒ the fallback.
function usageNum(usage: Record<string, unknown> | undefined, key: string): number {
  const raw = usage?.[key];
  return typeof raw === "number" ? raw : 0;
}
function usageNumOrNull(usage: Record<string, unknown> | undefined, key: string): number | null {
  const raw = usage?.[key];
  return typeof raw === "number" ? raw : null;
}

// Classify a content_block's declared type into where its deltas accumulate (no nested ternary).
function classifyBlock(type: string): BlockKind {
  switch (type) {
    case "text":
      return "text";
    case "thinking":
      return "thinking";
    case "redacted_thinking":
      return "redacted_thinking";
    default:
      return "other";
  }
}

// message_start: the INPUT-side usage (input + cache read/write + creation buckets) rides the initial Message.
function applyMessageStart(
  acc: Acc,
  event: RawMessageStreamEvent & { type: "message_start" },
): void {
  const usage = isRecord(event.message.usage) ? event.message.usage : undefined;
  acc.inputTokens = usageNum(usage, "input_tokens");
  acc.cacheReadTokens = usageNum(usage, "cache_read_input_tokens");
  acc.cacheWriteTokens = usageNum(usage, "cache_creation_input_tokens");
  const creation = isRecord(usage?.["cache_creation"]) ? usage?.["cache_creation"] : undefined;
  acc.cacheCreation5mTokens = usageNumOrNull(creation, "ephemeral_5m_input_tokens");
  acc.cacheCreation1hTokens = usageNumOrNull(creation, "ephemeral_1h_input_tokens");
}

// message_delta: the stop reason + output usage — AND the INPUT-side usage (input + cache read/write). OR's
// `/v1/messages` passthrough delivers input/cache HERE, not in `message_start` (which OR sends all-null —
// probe-confirmed 2026-07-10; direct Anthropic puts it in `message_start`). Max-merge across both envelopes
// so whichever carries the real value wins and a 0/absent field never clobbers it — makes the OR-key
// anth-direct cache VISIBLE (it was caching all along; only the receipt was read from the wrong event).
function applyMessageDelta(
  acc: Acc,
  event: RawMessageStreamEvent & { type: "message_delta" },
): void {
  acc.stopReason = event.delta.stop_reason;
  const usage = isRecord(event.usage) ? event.usage : undefined;
  acc.outputTokens = usageNum(usage, "output_tokens");
  acc.inputTokens = Math.max(acc.inputTokens, usageNum(usage, "input_tokens"));
  acc.cacheReadTokens = Math.max(acc.cacheReadTokens, usageNum(usage, "cache_read_input_tokens"));
  acc.cacheWriteTokens = Math.max(
    acc.cacheWriteTokens,
    usageNum(usage, "cache_creation_input_tokens"),
  );
  const creation = isRecord(usage?.["cache_creation"]) ? usage["cache_creation"] : undefined;
  acc.cacheCreation5mTokens =
    usageNumOrNull(creation, "ephemeral_5m_input_tokens") ?? acc.cacheCreation5mTokens;
  acc.cacheCreation1hTokens =
    usageNumOrNull(creation, "ephemeral_1h_input_tokens") ?? acc.cacheCreation1hTokens;
}

// content_block_delta: route text/thinking to the right accumulator + fire onDelta.
function applyBlockDelta(
  acc: Acc,
  event: RawMessageStreamEvent & { type: "content_block_delta" },
  ctx: {
    readonly chatId: ChatId;
    readonly markFirstDelta: () => void;
    readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  },
): void {
  const delta = event.delta;
  if (delta.type === "text_delta") {
    acc.reply += delta.text;
    ctx.markFirstDelta();
    ctx.onDelta?.({ chatId: ctx.chatId, kind: "text", text: delta.text });
  } else if (delta.type === "thinking_delta") {
    acc.reasoning += delta.thinking;
    ctx.markFirstDelta();
    ctx.onDelta?.({ chatId: ctx.chatId, kind: "reasoning", text: delta.thinking });
  }
  // signature_delta / input_json_delta / citations_delta carry no visible text — ignored.
}

/**
 * Drain the SDK event stream into {@link AnthReducedTurn}. `onDelta` fires per text/thinking delta with the
 * turn's `chatId` (the caller-supplied correlation). `now` is injected (the determinism seam — the ttft
 * clock is not ambient). Only the fields anth-direct requests are handled; a tool/server block (never
 * requested — tool-less charter) accumulates nowhere and cannot misroute into `reply`.
 */
export async function reduceAnthStream(
  stream: Stream<RawMessageStreamEvent>,
  args: {
    readonly chatId: ChatId;
    readonly startedAt: number;
    readonly now: () => number;
    /** Fired on EVERY received event to restart the idle-abort window (the runner passes `idle.reset`). */
    readonly onChunk?: (() => void) | undefined;
    readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  },
): Promise<AnthReducedTurn> {
  const { chatId, startedAt, now, onChunk, onDelta } = args;
  const acc: Acc = {
    reply: "",
    reasoning: "",
    reasoningRedacted: false,
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    firstDeltaAt: null,
    blockKinds: new Map<number, BlockKind>(),
  };
  const markFirstDelta = (): void => {
    if (acc.firstDeltaAt === null) {
      acc.firstDeltaAt = now() - startedAt;
    }
  };

  for await (const event of stream) {
    onChunk?.(); // restart the idle window on every received event (a healthy long stream never trips)
    if (event.type === "message_start") {
      applyMessageStart(acc, event);
    } else if (event.type === "content_block_start") {
      const kind = classifyBlock(event.content_block.type);
      acc.blockKinds.set(event.index, kind);
      if (kind === "redacted_thinking") {
        acc.reasoningRedacted = true;
      }
    } else if (event.type === "content_block_delta") {
      applyBlockDelta(acc, event, { chatId, markFirstDelta, onDelta });
    } else if (event.type === "message_delta") {
      applyMessageDelta(acc, event);
    }
    // content_block_stop / message_stop carry no accumulation.
  }

  return {
    reply: acc.reply,
    reasoning: acc.reasoning,
    reasoningRedacted: acc.reasoningRedacted,
    stopReason: acc.stopReason,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    cacheCreation5mTokens: acc.cacheCreation5mTokens,
    cacheCreation1hTokens: acc.cacheCreation1hTokens,
    firstDeltaAt: acc.firstDeltaAt,
  };
}
