// The V4 STREAM REDUCER — the ONE fold from `LanguageModelV4StreamPart` into what a turn needs: the reply,
// the reasoning, the assembled tool calls, any generated images (§6.7), the raw + unified finish reason, the
// nested usage and the provider metadata off the `finish` part. Shared by the openai-compat and
// anthropic-messages backends (both drive a V4 `doStream`). `onText`/`onReasoning` fire per delta —
// the caller marks the retry COMMITTED on the first one; `onPart` fires on every part (the idle-timer reset).
// A stream that ends without a `finish` part is a TRUNCATED turn and fails closed (#1400's class), never an
// empty success. An `error` part is re-thrown for the caller's classifier.

import type {
  LanguageModelV4File,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from "@ai-sdk/provider";
import type { ToolCallInput } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { GeneratedImage } from "../../contract/roles.ts";

const BASE64 = "base64";
const IMAGE_PREFIX = "image/";

export interface StreamDrain {
  readonly reply: string;
  readonly reasoning: string;
  readonly toolCalls: readonly ToolCallInput[];
  readonly images: readonly GeneratedImage[];
  readonly finish: LanguageModelV4FinishReason;
  readonly usage: LanguageModelV4Usage | undefined;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;
  readonly responseId: string | undefined;
  readonly warnings: readonly SharedV4Warning[];
}

export interface DrainCallbacks {
  readonly onPart?: (() => void) | undefined;
  readonly onText?: ((text: string) => void) | undefined;
  readonly onReasoning?: ((text: string) => void) | undefined;
  readonly onImage?: ((image: GeneratedImage) => void) | undefined;
  readonly label: string;
}

interface Accumulator {
  reply: string;
  reasoning: string;
  readonly toolCalls: ToolCallInput[];
  readonly images: GeneratedImage[];
  readonly warnings: SharedV4Warning[];
  finish: LanguageModelV4FinishReason | undefined;
  usage: LanguageModelV4Usage | undefined;
  providerMetadata: SharedV4ProviderMetadata | undefined;
  responseId: string | undefined;
}

/** A generated `file` part → the cross-family `GeneratedImage` (bytes as base64, a URL as a reference). */
export function generatedImageOf(file: Pick<LanguageModelV4File, "mediaType" | "data">): GeneratedImage | null {
  if (!file.mediaType.startsWith(IMAGE_PREFIX)) {
    return null;
  }
  if (file.data.type === "url") {
    return { url: file.data.url.toString(), base64: undefined, mediaType: file.mediaType };
  }
  const bytes = file.data.data;
  return { url: undefined, base64: typeof bytes === "string" ? bytes : Buffer.from(bytes).toString(BASE64), mediaType: file.mediaType };
}

function applyContentPart(acc: Accumulator, part: LanguageModelV4StreamPart, callbacks: DrainCallbacks): void {
  if (part.type === "text-delta") {
    acc.reply += part.delta;
    callbacks.onText?.(part.delta);
  } else if (part.type === "reasoning-delta") {
    acc.reasoning += part.delta;
    callbacks.onReasoning?.(part.delta);
  } else if (part.type === "tool-call") {
    acc.toolCalls.push({ toolCallId: part.toolCallId, name: part.toolName, arguments: part.input });
  } else if (part.type === "file") {
    const image = generatedImageOf(part);
    if (image !== null) {
      acc.images.push(image);
      callbacks.onImage?.(image);
    }
  }
}

function applyControlPart(acc: Accumulator, part: LanguageModelV4StreamPart, label: string): void {
  if (part.type === "stream-start") {
    acc.warnings.push(...part.warnings);
  } else if (part.type === "response-metadata") {
    acc.responseId = part.id ?? acc.responseId;
  } else if (part.type === "finish") {
    acc.finish = part.finishReason;
    acc.usage = part.usage;
    acc.providerMetadata = part.providerMetadata;
  } else if (part.type === "error") {
    throw part.error instanceof Error
      ? part.error
      : new ProviderError({ kind: "server", retryable: true, message: `${label}: the stream carried an error part`, cause: part.error });
  }
}

export async function drainStream(stream: ReadableStream<LanguageModelV4StreamPart>, callbacks: DrainCallbacks): Promise<StreamDrain> {
  const acc: Accumulator = {
    reply: "",
    reasoning: "",
    toolCalls: [],
    images: [],
    warnings: [],
    finish: undefined,
    usage: undefined,
    providerMetadata: undefined,
    responseId: undefined,
  };
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      callbacks.onPart?.();
      applyContentPart(acc, value, callbacks);
      applyControlPart(acc, value, callbacks.label);
    }
  } finally {
    reader.releaseLock();
  }
  if (acc.finish === undefined) {
    throw new ProviderError({ kind: "server", retryable: true, message: `${callbacks.label}: the stream ended without a finish part (truncated turn)` });
  }
  return {
    reply: acc.reply,
    reasoning: acc.reasoning,
    toolCalls: acc.toolCalls,
    images: acc.images,
    finish: acc.finish,
    usage: acc.usage,
    providerMetadata: acc.providerMetadata,
    responseId: acc.responseId,
    warnings: acc.warnings,
  };
}
