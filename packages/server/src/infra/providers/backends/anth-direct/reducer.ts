// Drains the SDK's typed `Stream<RawMessageStreamEvent>` into the accumulated turn shape the runner maps
// to `ChatResult`. Event model: message_start (initial usage) → N × [content_block_start/delta/stop] →
// message_delta (terminal stop_reason + output usage) → message_stop. Tracks each open block's type by
// index so text_delta routes to reply and thinking_delta routes to reasoning.

import type { Stream } from "@anthropic-ai/sdk/core/streaming";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ChatId } from "@orb/kit/ids";
import type { ChatDeltaEvent } from "../../contract";

// `other` covers tool/server blocks anth-direct never requests but must not misroute if one ever appears.
const BLOCK_KINDS = ["text", "thinking", "redacted_thinking", "other"] as const;
type BlockKind = (typeof BLOCK_KINDS)[number];

export interface AnthReducedTurn {
  readonly reply: string;
  readonly reasoning: string;
  readonly reasoningRedacted: boolean;
  readonly stopReason: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  /** ttft in ms since the injected `startedAt`; null when the stream produced no visible delta. */
  readonly firstDeltaAt: number | null;
}

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

function usageNum(usage: Record<string, unknown> | undefined, key: string): number {
  const raw = usage?.[key];
  return typeof raw === "number" ? raw : 0;
}
function usageNumOrNull(usage: Record<string, unknown> | undefined, key: string): number | null {
  const raw = usage?.[key];
  return typeof raw === "number" ? raw : null;
}

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

// OR's /v1/messages passthrough delivers input/cache usage in message_delta, not message_start (which OR
// sends all-null). Max-merge across both envelopes so whichever carries the real value wins.
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
}

export async function reduceAnthStream(
  stream: Stream<RawMessageStreamEvent>,
  args: {
    readonly chatId: ChatId;
    readonly startedAt: number;
    readonly now: () => number;
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
    onChunk?.();
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
