// The V4 STREAM REDUCER — the ONE fold from `LanguageModelV4StreamPart` into what a turn needs: the reply,
// the reasoning, the assembled tool calls, any generated images, the sources the model cited, the raw +
// unified finish reason, the nested usage and the provider metadata off the `finish` part. Shared by the
// openai-compat and anthropic-messages backends (both drive a V4 `doStream`). `onText`/`onReasoning` fire per
// delta — the caller marks the retry COMMITTED on the first one; `onPart` fires on every part (the idle-timer
// reset).
// A stream that ends without a `finish` part — or with one the PROVIDER SYNTHESIZED on flush rather than read
// off the wire (`isSynthesizedFinish`, whose comment carries the measurement) — is a TRUNCATED turn and fails
// closed, never an empty success. An `error` part is re-thrown for the caller's classifier.
// A tool-input triple is dropped by contract (the terminal `tool-call` part is mandatory), and a stream that
// opens one and never sends that call fails closed by the same rule.

import type {
  JSONObject,
  LanguageModelV4File,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from "@ai-sdk/provider";
import type { ChatSource } from "@orb/contracts/chat";
import { toolCallIdSchema } from "@orb/contracts/chat";
import type { ProviderGenerationId } from "@orb/contracts/inference";
import { providerGenerationIdSchema } from "@orb/contracts/inference";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import type { GeneratedImage, ReasoningContentPart, ToolCallInput } from "#contract";
import { ProviderError } from "#contract";
import type { DrainCallbacks, StreamDrain } from "#src/contract/v4.ts";
import { classifyHttpStatus, credentialDetail } from "../http/error-classify.ts";

/** An OpenAI-compatible error frame's payload (NanoGPT's Error Handling page: `{status, message, code}`). */
const HTTP_ERROR_FLOOR = 400;
const HTTP_ERROR_CEILING = 599;
const errorPartStatusSchema = z.looseObject({ status: z.number().int().min(HTTP_ERROR_FLOOR).max(HTTP_ERROR_CEILING) });

const BASE64 = "base64";
const IMAGE_PREFIX = "image/";
const GOOGLE_KEY = "google";
const THOUGHT_SIGNATURE_KEY = "thoughtSignature";
const ANTHROPIC_KEY = "anthropic";
const OPENROUTER_KEY = "openrouter";
const SIGNATURE_KEY = "signature";
const REDACTED_DATA_KEY = "redactedData";
const REASONING_DETAILS_KEY = "reasoning_details";
/** The OpenRouter wire's own span keys under `providerMetadata.openrouter`, built from the response's
 *  `url_citation` annotation (`@openrouter/ai-sdk-provider@3.1.0`'s annotation builder). The provider
 *  substitutes `0` for a missing index and `""` for a missing title/content, so a zero-width span and an
 *  empty string both read as "the wire supplied none". */
const START_INDEX_KEY = "startIndex";
const END_INDEX_KEY = "endIndex";
const SOURCE_CONTENT_KEY = "content";

/** One reasoning block under construction: its text so far and whichever wire provenance has arrived. The
 *  provenance and the text arrive on DIFFERENT parts and in wire-specific order — Anthropic puts the
 *  `signature` on a trailing zero-length `reasoning-delta` and the `redactedData` on `reasoning-start`;
 *  OpenRouter puts the whole accumulated `reasoning_details` list on `reasoning-end`. Keying by the SDK's
 *  part `id` is what lets a turn with several blocks keep each one's provenance with its own text. */
interface ReasoningAcc {
  text: string;
  signature: string | undefined;
  thoughtSignature: string | undefined;
  redactedData: string | undefined;
  reasoningDetails: readonly JsonValue[] | undefined;
}

/** One text block under construction: its text so far, its thought signature, and where it OPENED in
 *  `acc.reply`. The arrival point is the origin a block-relative citation index is measured from, and it is
 *  only knowable here — nothing later sees text blocks and citations interleaved in stream order. */
interface TextBlockAcc {
  text: string;
  thoughtSignature: string | undefined;
  atChars: number;
}

interface Accumulator {
  nextPartOrdinal: number;
  reply: string;
  reasoning: string;
  readonly reasoningParts: Map<string, ReasoningAcc>;
  readonly textParts: Map<string, TextBlockAcc>;
  readonly toolCalls: ToolCallInput[];
  readonly toolMetadata: Map<number, SharedV4ProviderMetadata>;
  /** Tool-call ids the stream opened (id → tool name); a delta for an id the stream never opened records
   *  `undefined`, because a delta is itself a promise of a call. Keyed by ID, never by name: two calls to one
   *  tool are two ids, and a name-keyed check would excuse a truncated second call. The drain refuses any entry
   *  with no terminal `tool-call` — see the contract note at the `tool-input-*` arm. */
  readonly toolInputsStarted: Map<string, string | undefined>;
  readonly images: GeneratedImage[];
  /** Every source the wire cited, in arrival order and never deduplicated (see {@link citedSource}). */
  readonly sources: ChatSource[];
  readonly warnings: SharedV4Warning[];
  finish: LanguageModelV4FinishReason | undefined;
  usage: LanguageModelV4Usage | undefined;
  providerMetadata: SharedV4ProviderMetadata | undefined;
  responseId: ProviderGenerationId | undefined;
  servedModel: string | undefined;
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

/** A wire-supplied string where the EMPTY STRING means "not supplied" — OpenRouter's `?? ""` substitution for
 *  a missing `title` or `content` on a `url_citation` (`@openrouter/ai-sdk-provider@3.1.0`). */
function suppliedAt(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function numberAt(bag: JSONObject | undefined, key: string): number | undefined {
  const value = bag?.[key];
  return typeof value === "number" ? value : undefined;
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
  block.thoughtSignature = stringAt(metadata?.[GOOGLE_KEY], THOUGHT_SIGNATURE_KEY) ?? block.thoughtSignature;
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
  const fresh: ReasoningAcc = { text: "", thoughtSignature: undefined, signature: undefined, redactedData: undefined, reasoningDetails: undefined };
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

function applyTextSignature(acc: Accumulator, part: LanguageModelV4StreamPart): void {
  if (part.type === "text-start" || part.type === "text-delta" || part.type === "text-end") {
    // The block's arrival point joins its text and signature: a citation measured from this block needs the
    // reply offset the block OPENED at, and `acc.reply` already holds the prose in front of it.
    const block = acc.textParts.getOrInsertComputed(part.id, () => ({ text: "", thoughtSignature: undefined, atChars: acc.reply.length }));
    if (part.type === "text-delta") {
      block.text += part.delta;
    }
    block.thoughtSignature = stringAt(part.providerMetadata?.[GOOGLE_KEY], THOUGHT_SIGNATURE_KEY) ?? block.thoughtSignature;
    applyTextCitations(acc, part, block);
  }
}

/** Where the text block the wire is currently writing opened, in `acc.reply` offsets. A `source` part carries
 *  no block id (the SDK's part has none) and the wire that emits one writes a single text block per message,
 *  so the last block the fold opened is the block the part belongs to. `0` before any text arrives, which is
 *  also where a citation of the message's own text starts. */
function textBlockStart(acc: Accumulator): number {
  let at = 0;
  for (const block of acc.textParts.values()) {
    at = block.atChars;
  }
  return at;
}

/** ONE cited source on the reply's own offset frame. A wire-supplied span is measured from the text block the
 *  citation belongs to (`origin`); a wire that supplies none is placed where the fold learned of it
 *  (`arrival`), the only offset such a wire states. The empty-string substitutions read as absent, and a
 *  zero-width span counts as no span — an `end > start` test is what tells the provider's `0`-for-missing
 *  default from a real span. */
function citedSource(args: {
  readonly url: string;
  readonly title: string | undefined;
  readonly citedText: string | undefined;
  readonly origin: number;
  readonly arrival: number;
  readonly start: number | undefined;
  readonly end: number | undefined;
}): ChatSource {
  const placed = args.start !== undefined && args.end !== undefined && args.end > args.start;
  const title = suppliedAt(args.title);
  const citedText = suppliedAt(args.citedText);
  return {
    url: args.url,
    ...(title === undefined ? {} : { title }),
    atChars: placed ? args.origin + args.start : args.arrival,
    ...(placed ? { endChars: args.origin + args.end } : {}),
    ...(citedText === undefined ? {} : { citedText }),
  };
}

/** A text block's `text-end` citations → the same list. The SDK defines `LanguageModelV4Citation.startIndex`
 *  as an offset "in the containing generated text", so the block's arrival point shifts it into the reply
 *  frame; the installed `@ai-sdk/anthropic@4.0.85` states `citedText` and the source and no index at all
 *  (its `mapAnthropicCitation`), which places the citation at the block it supports. A document-typed source drops
 *  here for the same reason it drops off a `source` part — see {@link applySourcePart}. */
function applyTextCitations(acc: Accumulator, part: LanguageModelV4StreamPart, block: TextBlockAcc): void {
  if (part.type !== "text-end" || part.citations === undefined) {
    return;
  }
  for (const citation of part.citations) {
    if (citation.source.sourceType !== "url") {
      continue;
    }
    acc.sources.push(
      citedSource({
        url: citation.source.url,
        title: citation.source.title,
        citedText: citation.citedText,
        origin: block.atChars,
        arrival: block.atChars,
        start: citation.startIndex,
        end: citation.endIndex,
      }),
    );
  }
}

/** A `source` part → one entry. The OpenRouter wire states its span in `providerMetadata.openrouter` and
 *  stamps the same URL once per `url_citation` annotation, so the part IS the citation arrival.
 *
 *  TWO parts of this wire family are skipped, each for a measured reason:
 *   · an Anthropic URL citation can arrive TWICE — inside its block's `text-end.citations`
 *     (`@ai-sdk/anthropic@4.0.85`'s `content_block_stop` arm maps the block's collected citations through
 *     `mapAnthropicCitation`) and as a bare `source` part, either from the `citations_delta` case's
 *     `createCitationSource` for a `search_result_location`, or, when the response carried no server-side
 *     web-search results, from the `!hasWebSearchResults` fallback loop over `fallbackWebCitations` in
 *     `message_stop` — and only the block-associated copy can be placed in the reply, so the bare copy is
 *     not a second fact.
 *   · a `document` source has NO producer in this graph (this app sends no document content block and the
 *     OpenRouter provider emits `url` sources only), so the refused member drops without faulting the turn.
 *
 *  Offered EVERY part, like `applyTextSignature` above it: every other type returns at the first test, so the
 *  content cascade carries no branch of its own for a citation. */
function applySourcePart(acc: Accumulator, part: LanguageModelV4StreamPart): void {
  if (part.type !== "source" || part.sourceType !== "url" || part.providerMetadata?.[ANTHROPIC_KEY] !== undefined) {
    return;
  }
  const bag = part.providerMetadata?.[OPENROUTER_KEY];
  acc.sources.push(
    citedSource({
      url: part.url,
      title: part.title,
      citedText: stringAt(bag, SOURCE_CONTENT_KEY),
      origin: textBlockStart(acc),
      arrival: acc.reply.length,
      start: numberAt(bag, START_INDEX_KEY),
      end: numberAt(bag, END_INDEX_KEY),
    }),
  );
}

function openRouterToolMeta(metadata: SharedV4ProviderMetadata | undefined): Pick<ToolCallInput, "openrouter"> {
  const reasoningDetails = jsonArrayAt(metadata?.[OPENROUTER_KEY], REASONING_DETAILS_KEY);
  return reasoningDetails === undefined || reasoningDetails.length === 0 ? {} : { openrouter: { reasoningDetails } };
}

/** Records a tool-input triple's opening id in `acc.toolInputsStarted`; the call itself is the terminal
 *  `tool-call` part, and the drain refuses a triple that never reaches it. Every part is offered here and
 *  every other type is ignored, so the content cascade carries no extra arm. */
function recordToolInput(acc: Accumulator, part: LanguageModelV4StreamPart): void {
  if (part.type !== "tool-input-start" && part.type !== "tool-input-delta") {
    return;
  }
  // The triple carries ARGUMENT BYTES only, and the terminal `tool-call` part is the contract's mandatory
  // completion whatever the delta encoding (@ai-sdk/provider@4.0.31's `inputEncoding` doc on the
  // `tool-input-start` part: "The final tool-call input must still be JSON-encoded, regardless of the delta
  // encoding"). The fold drops these parts and keeps the call — and the drain refuses a stream that leaves
  // the call behind, because a deltas-only wire would otherwise commit ZERO tool calls as a successful prose
  // turn.
  acc.toolInputsStarted.set(part.id, part.type === "tool-input-start" ? part.toolName : acc.toolInputsStarted.get(part.id));
}

function applyContentPart(acc: Accumulator, part: LanguageModelV4StreamPart, callbacks: DrainCallbacks): void {
  applyTextSignature(acc, part);
  applySourcePart(acc, part);
  if (part.type === "text-delta") {
    acc.reply += part.delta;
    callbacks.onText?.(part.delta);
  } else if (part.type === "reasoning-start" || part.type === "reasoning-delta" || part.type === "reasoning-end") {
    applyReasoningPart(acc, part, callbacks);
  } else if (part.type === "tool-call") {
    // The compatible SDK keys metadata by the endpoint's provider name; the signature field stays stable.
    const thoughtSignature = Object.values(part.providerMetadata ?? {})
      .map((metadata) => metadata["thoughtSignature"])
      .find((value): value is string => typeof value === "string");
    if (part.providerMetadata !== undefined) {
      acc.toolMetadata.set(acc.toolCalls.length, part.providerMetadata);
    }
    acc.toolCalls.push({
      toolCallId: toolCallIdSchema.parse(part.toolCallId),
      name: part.toolName,
      arguments: part.input,
      atChars: acc.reply.length,
      partOrdinal: acc.nextPartOrdinal++,
      ...(thoughtSignature === undefined ? {} : { thoughtSignature }),
    });
  } else if (part.type === "file") {
    const image = generatedImageOf(part);
    if (image !== null) {
      // STAMP THE ARRIVAL POINT: the reply text accumulated SO FAR is where this picture sat in the
      // model's own output, and it is the only moment that offset is knowable — the drain is the one place
      // text and file parts are still interleaved in stream order. The chat reducer splices the span there
      // and mints the alt from the prose in front of it.
      const signature = stringAt(part.providerMetadata?.[GOOGLE_KEY], THOUGHT_SIGNATURE_KEY);
      const placed: GeneratedImage = {
        ...image,
        atChars: acc.reply.length,
        partOrdinal: acc.nextPartOrdinal++,
        ...(signature === undefined ? {} : { thoughtSignature: signature }),
      };
      acc.images.push(placed);
      callbacks.onImage?.(placed);
    }
  }
}

function applyControlPart(acc: Accumulator, part: LanguageModelV4StreamPart, callbacks: DrainCallbacks): void {
  if (part.type === "stream-start") {
    acc.warnings.push(...part.warnings);
  } else if (part.type === "response-metadata") {
    const id = providerGenerationIdSchema.safeParse(part.id);
    acc.responseId = id.success ? id.data : acc.responseId;
    acc.servedModel = part.modelId ?? acc.servedModel;
  } else if (part.type === "finish") {
    acc.finish = part.finishReason;
    acc.usage = part.usage;
    acc.providerMetadata = part.providerMetadata;
  } else if (part.type === "error") {
    if (part.error instanceof Error) {
      throw part.error;
    }
    const words = callbacks.errorWords?.(part.error);
    const message = words === undefined ? "the stream carried an error part" : `the stream failed: ${words}`;
    // A payload's numeric `status` is the HTTP status it would have carried before the stream, so the same table
    // picks the kind; a payload without one stays a server fault.
    const status = errorPartStatusSchema.safeParse(part.error).data?.status;
    const classified = status === undefined ? { kind: "server" as const, retryable: true } : classifyHttpStatus(status);
    // The payload is the body's `error` object, so its structured code names the key exactly as a pre-stream body's
    // does, and the wire's 403 rule judges a frame by the same evidence.
    throw new ProviderError({
      ...classified,
      message: `${callbacks.label}: ${message}`,
      ...(status === undefined ? {} : { apiErrorStatus: status }),
      ...credentialDetail(classified.kind, { error: part.error }),
      cause: part.error,
    });
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
      ...(block.thoughtSignature === undefined ? {} : { google: { thoughtSignature: block.thoughtSignature } }),
      ...(Object.keys(anthropic).length > 0 ? { anthropic } : {}),
      ...(block.reasoningDetails !== undefined ? { openrouter: { reasoningDetails: block.reasoningDetails } } : {}),
    };
    if (Object.keys(meta).length > 0) {
      out.push({ type: "reasoning", text: block.text, meta });
    }
  }
  return out;
}

/**
 * THE SYNTHESIZED FINISH.
 *
 * `acc.finish === undefined` below is the honest truncation guard — and on the openai-compat wire it is
 * STRUCTURALLY UNREACHABLE, because both of that wire's providers manufacture a `finish` part on FLUSH
 * whether or not the upstream ever sent one:
 *   · `@ai-sdk/openai-compatible@3.0.75` — its `doStream` initialises
 *     `finishReason = { unified: "other", raw: undefined }` and its transform's `flush(controller)` enqueues
 *     it unconditionally with `convertOpenAICompatibleCompletionUsage(usage)` while `usage` is still `void 0`
 *     (an all-`undefined` usage).
 *   · `@openrouter/ai-sdk-provider@3.1.0` — the same `createFinishReason("other")` initialiser in both stream
 *     paths, emitted from each one's own flush.
 * (The direct `@ai-sdk/anthropic@4.0.85` wire does NOT do this: its `message_stop` arm is the only place that
 * enqueues a `finish` part, so a truncated Anthropic stream genuinely has no finish part and the
 * `undefined` guard fires. That asymmetry is exactly what makes the synthesized case easy to miss — one wire
 * failed closed and looked like proof the class was handled.)
 *
 * Absent this guard, a truncated openai-compat stream RESOLVES: `drainStream` returns normally with
 * `reply: ""`, `finishReason: "other"`, `stopReason: "other"` and null tokens — an empty reply committed to
 * canon as a successful turn, and a partial stream commits the partial text the same way. A byte-equality
 * wire pin cannot see this: the REQUEST is unchanged.
 *
 * THE TELL, and why it cannot swallow a legitimate termination: a real `other` finish always carries at
 * least ONE of the two things the synthesized default lacks — the provider's own raw stop word, or a token
 * count. The guard fires only when BOTH are absent, which is the flush default and nothing else. A genuine
 * `finish_reason: "error"`/`"other"` carries `raw`; an endpoint that reports no usage still carries `raw`; a
 * provider that omits the stop word still reports tokens. `0` tokens is a REPORTED zero and is `!== undefined`,
 * so a legitimately empty generation is untouched.
 */
function isSynthesizedFinish(finish: LanguageModelV4FinishReason, usage: LanguageModelV4Usage | undefined): boolean {
  if (finish.unified !== "other" || finish.raw !== undefined) {
    return false;
  }
  return usage === undefined || (usage.inputTokens.total === undefined && usage.outputTokens.total === undefined);
}

export async function drainStream(stream: ReadableStream<LanguageModelV4StreamPart>, callbacks: DrainCallbacks): Promise<StreamDrain> {
  const acc: Accumulator = {
    nextPartOrdinal: 0,
    reply: "",
    reasoning: "",
    reasoningParts: new Map(),
    textParts: new Map(),
    toolCalls: [],
    toolMetadata: new Map(),
    toolInputsStarted: new Map(),
    images: [],
    sources: [],
    warnings: [],
    finish: undefined,
    usage: undefined,
    providerMetadata: undefined,
    responseId: undefined,
    servedModel: undefined,
  };
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      callbacks.onPart?.();
      if (value.type === "raw") {
        callbacks.onRaw?.(value.rawValue);
      }
      applyContentPart(acc, value, callbacks);
      recordToolInput(acc, value);
      applyControlPart(acc, value, callbacks);
    }
  } finally {
    reader.releaseLock();
  }
  if (acc.finish === undefined || isSynthesizedFinish(acc.finish, acc.usage)) {
    throw new ProviderError({ kind: "server", retryable: true, message: `${callbacks.label}: the stream ended without a finish part (truncated turn)` });
  }
  // A tool-input triple that never reached its mandatory terminal `tool-call` part (see the arm in
  // `applyContentPart`) would leave the turn with the prose around a call that does not exist. The `tool-call`
  // part carries the triple's id as `toolCallId`, so that is the key both sides share.
  const [unfinished] = [...acc.toolInputsStarted.entries()].filter(([id]) => !acc.toolCalls.some((call) => call.toolCallId === id));
  if (unfinished !== undefined) {
    const [id, name] = unfinished;
    const which = name === undefined ? `tool-call id "${id}"` : `"${name}" (tool-call id "${id}")`;
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${callbacks.label}: the stream sent tool-input deltas for ${which} but no terminal tool-call part (provider contract violation)`,
    });
  }
  return {
    reply: acc.reply,
    textSignatures: [...acc.textParts.values()].flatMap((part) =>
      part.thoughtSignature === undefined ? [] : [{ text: part.text, thoughtSignature: part.thoughtSignature }],
    ),
    sources: acc.sources,
    reasoning: acc.reasoning,
    reasoningParts: reasoningPartsOf(acc),
    toolCalls: acc.toolCalls.map((call, index) => ({ ...call, ...openRouterToolMeta(acc.toolMetadata.get(index)) })),
    images: acc.images,
    finish: acc.finish,
    usage: acc.usage,
    providerMetadata: acc.providerMetadata,
    responseId: acc.responseId,
    servedModel: acc.servedModel,
    warnings: acc.warnings,
  };
}

export type { DrainCallbacks, StreamDrain } from "#src/contract/v4.ts";
