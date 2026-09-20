// The V4 STREAM REDUCER — the ONE fold from `LanguageModelV4StreamPart` into what a turn needs: the reply,
// the reasoning, the assembled tool calls, any generated images (§6.7), the raw + unified finish reason, the
// nested usage and the provider metadata off the `finish` part. Shared by the openai-compat and
// anthropic-messages backends (both drive a V4 `doStream`). `onText`/`onReasoning` fire per delta —
// the caller marks the retry COMMITTED on the first one; `onPart` fires on every part (the idle-timer reset).
// A stream that ends without a `finish` part is a TRUNCATED turn and fails closed (#1400's class), never an
// empty success. An `error` part is re-thrown for the caller's classifier.

import type {
  JSONObject,
  LanguageModelV4File,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from "@ai-sdk/provider";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ReasoningContentPart, ToolCallInput } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { GeneratedImage } from "../../contract/roles.ts";

const BASE64 = "base64";
const IMAGE_PREFIX = "image/";
const ANTHROPIC_KEY = "anthropic";
const OPENROUTER_KEY = "openrouter";
const SIGNATURE_KEY = "signature";
const REDACTED_DATA_KEY = "redactedData";
const REASONING_DETAILS_KEY = "reasoning_details";

export interface StreamDrain {
  readonly reply: string;
  readonly reasoning: string;
  /** One entry per reasoning BLOCK the provider opened, in stream order, carrying that block's text and the
   *  wire-opaque provenance the next leg must replay (§A1). Empty when the wire surfaced no reasoning. */
  readonly reasoningParts: readonly ReasoningContentPart[];
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

/** One reasoning block under construction: its text so far and whichever wire provenance has arrived. The
 *  provenance and the text arrive on DIFFERENT parts and in wire-specific order — Anthropic puts the
 *  `signature` on a trailing zero-length `reasoning-delta` and the `redactedData` on `reasoning-start`;
 *  OpenRouter puts the whole accumulated `reasoning_details` list on `reasoning-end`. Keying by the SDK's
 *  part `id` is what lets a turn with several blocks keep each one's provenance with its own text. */
interface ReasoningAcc {
  text: string;
  signature: string | undefined;
  redactedData: string | undefined;
  reasoningDetails: readonly JsonValue[] | undefined;
}

interface Accumulator {
  reply: string;
  reasoning: string;
  readonly reasoningParts: Map<string, ReasoningAcc>;
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

function stringAt(bag: JSONObject | undefined, key: string): string | undefined {
  const value = bag?.[key];
  return typeof value === "string" ? value : undefined;
}

/** The provider's own JSON list, kept VERBATIM. PARSED across the seam rather than cast: the SDK's
 *  `JSONValue` admits `undefined`-valued object properties and ours does not, so `jsonValueSchema` is what
 *  makes the two shapes one — the same parse-on-read idiom the JSON columns use, at the only cost of a
 *  handful of small objects per turn. */
function jsonArrayAt(bag: JSONObject | undefined, key: string): readonly JsonValue[] | undefined {
  const parsed = jsonValueSchema.safeParse(bag?.[key]);
  return parsed.success && Array.isArray(parsed.data) ? parsed.data : undefined;
}

/** Fold one reasoning part's `providerMetadata` into its block. Each field is LAST-WRITE-WINS on purpose:
 *  the wires deliver provenance incrementally (a signature arrives after its text; OpenRouter re-sends the
 *  whole accumulated details list), so the newest value is always the complete one. */
function applyReasoningMeta(block: ReasoningAcc, metadata: SharedV4ProviderMetadata | undefined): void {
  const anthropic = metadata?.[ANTHROPIC_KEY];
  block.signature = stringAt(anthropic, SIGNATURE_KEY) ?? block.signature;
  block.redactedData = stringAt(anthropic, REDACTED_DATA_KEY) ?? block.redactedData;
  block.reasoningDetails = jsonArrayAt(metadata?.[OPENROUTER_KEY], REASONING_DETAILS_KEY) ?? block.reasoningDetails;
}

function reasoningBlock(acc: Accumulator, id: string): ReasoningAcc {
  const found = acc.reasoningParts.get(id);
  if (found !== undefined) {
    return found;
  }
  const fresh: ReasoningAcc = { text: "", signature: undefined, redactedData: undefined, reasoningDetails: undefined };
  acc.reasoningParts.set(id, fresh);
  return fresh;
}

/** The three reasoning parts, all of which may carry provenance (`reasoning-start` for Anthropic's redacted
 *  payload, `reasoning-delta` for its signature, `reasoning-end` for OpenRouter's `reasoning_details`). */
function applyReasoningPart(acc: Accumulator, part: LanguageModelV4StreamPart, callbacks: DrainCallbacks): void {
  if (part.type === "reasoning-start" || part.type === "reasoning-end") {
    applyReasoningMeta(reasoningBlock(acc, part.id), part.providerMetadata);
    return;
  }
  if (part.type !== "reasoning-delta") {
    return;
  }
  const block = reasoningBlock(acc, part.id);
  block.text += part.delta;
  applyReasoningMeta(block, part.providerMetadata);
  acc.reasoning += part.delta;
  if (part.delta !== "") {
    callbacks.onReasoning?.(part.delta);
  }
}

function applyContentPart(acc: Accumulator, part: LanguageModelV4StreamPart, callbacks: DrainCallbacks): void {
  if (part.type === "text-delta") {
    acc.reply += part.delta;
    callbacks.onText?.(part.delta);
  } else if (part.type === "reasoning-start" || part.type === "reasoning-delta" || part.type === "reasoning-end") {
    applyReasoningPart(acc, part, callbacks);
  } else if (part.type === "tool-call") {
    acc.toolCalls.push({ toolCallId: part.toolCallId, name: part.toolName, arguments: part.input });
  } else if (part.type === "file") {
    const image = generatedImageOf(part);
    if (image !== null) {
      // STAMP THE ARRIVAL POINT (§6.7): the reply text accumulated SO FAR is where this picture sat in the
      // model's own output, and it is the only moment that offset is knowable — the drain is the one place
      // text and file parts are still interleaved in stream order. The chat reducer splices the span there
      // and mints the alt from the prose in front of it.
      const placed: GeneratedImage = { ...image, atChars: acc.reply.length };
      acc.images.push(placed);
      callbacks.onImage?.(placed);
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

/** The accumulated blocks → the replayable parts, in the order the provider opened them. A block with NO
 *  provenance at all is dropped: replaying bare thinking text is what every converter refuses (the anthropic
 *  one warns and discards it, the OR one strips an unsigned entry), so carrying it would only manufacture a
 *  part that cannot ride. `text` may still be empty — a redacted block is provenance without prose. */
function reasoningPartsOf(acc: Accumulator): readonly ReasoningContentPart[] {
  const out: ReasoningContentPart[] = [];
  for (const block of acc.reasoningParts.values()) {
    const anthropic = {
      ...(block.signature !== undefined ? { signature: block.signature } : {}),
      ...(block.redactedData !== undefined ? { redactedData: block.redactedData } : {}),
    };
    const meta = {
      ...(Object.keys(anthropic).length > 0 ? { anthropic } : {}),
      ...(block.reasoningDetails !== undefined ? { openrouter: { reasoningDetails: block.reasoningDetails } } : {}),
    };
    if (Object.keys(meta).length > 0) {
      out.push({ type: "reasoning", text: block.text, meta });
    }
  }
  return out;
}

export async function drainStream(stream: ReadableStream<LanguageModelV4StreamPart>, callbacks: DrainCallbacks): Promise<StreamDrain> {
  const acc: Accumulator = {
    reply: "",
    reasoning: "",
    reasoningParts: new Map(),
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
    reasoningParts: reasoningPartsOf(acc),
    toolCalls: acc.toolCalls,
    images: acc.images,
    finish: acc.finish,
    usage: acc.usage,
    providerMetadata: acc.providerMetadata,
    responseId: acc.responseId,
    warnings: acc.warnings,
  };
}
