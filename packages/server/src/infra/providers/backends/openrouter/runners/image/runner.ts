// infra/providers/backends/openrouter/runners/image/runner — the two image roles OpenRouter serves:
//   • imageEmbed — joint image/text embedding via `embeddings.generate` with multimodal `input` (OR's embed
//     input accepts `image_url` parts, so hosted Qwen-VL embeds are real — providers.md §11). Carries
//     `model` back as the shared image/text space provenance.
//   • generateImage — text→image via `chat.send` with `modalities:["text","image"]`; the generated images
//     ride `choices[0].message.images[].imageUrl.url` (a data: URL or an http URL).
// Imports `backends/kit` DOWN; never a sibling backend.
//
// FLAG (image inputs): the contract's `ImageInput` is "bytes OR a filesystem path", but reading a path is
// the LOCAL tier's job (it has fs access by design). Here a STRING image input is passed through as a URL /
// data-URL (the common hosted shape); a Uint8Array is encoded as a `data:image/png;base64,…` URL (the mime
// is assumed png — OR sniffs the actual bytes). A bare filesystem path is NOT read here.

import type { ChatMessages, ChatRequest, ChatStreamChunk, ChatResult as SdkChatResult } from "@openrouter/sdk/models";
import type { ContentImageURL, CreateEmbeddingsRequestBody, CreateEmbeddingsResponse, Input } from "@openrouter/sdk/models/operations";
import type { GeneratedImage, ImageEmbedRequest, ImageEmbedResult, ImageGenerateRequest, ImageGenerateResult } from "../../../../contract";
import { ProviderError } from "../../../../contract";
import { providerErrorFromHttp } from "../../../kit";

const BASE64 = "base64";
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const DATA_URL_PREFIX = "data:";
const DEFAULT_IMAGE_MEDIA_TYPE = "image/png";
const IMAGE_TEXT_MODALITIES = ["text", "image"] as const;
const SYSTEM_ROLE = "system";
const USER_ROLE = "user";
const IMAGE_URL_TYPE = "image_url";
const TEXT_TYPE = "text";

// The structural slices this runner needs off the client port.
interface OrImageEmbedClient {
  readonly embeddings: {
    readonly generate: (
      request: { readonly requestBody: CreateEmbeddingsRequestBody },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<CreateEmbeddingsResponse>;
  };
}
interface OrImageGenClient {
  readonly chat: {
    readonly send: (
      request: { readonly chatRequest: ChatRequest },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<SdkChatResult | AsyncIterable<ChatStreamChunk>>;
  };
}

// One image input → a URL OpenRouter accepts: a string passes through (URL / data-URL); raw bytes become a
// base64 data URL (png assumed — see the header FLAG).
function toImageUrl(image: Uint8Array | string): string {
  if (typeof image === "string") {
    return image;
  }
  return `${PNG_DATA_URL_PREFIX}${Buffer.from(image).toString(BASE64)}`;
}

function imageContent(image: Uint8Array | string): ContentImageURL {
  return { type: IMAGE_URL_TYPE, imageUrl: { url: toImageUrl(image) } };
}

// Map the discriminated `ImageEmbedInput` → the embeddings `input` (a plain string/array for text; an array
// of multimodal `content` items for image / image+text).
function buildEmbedInput(req: ImageEmbedRequest): CreateEmbeddingsRequestBody["input"] {
  const { input } = req;
  if (input.kind === "text") {
    return typeof input.input === "string" ? input.input : [...input.input];
  }
  if (input.kind === "image") {
    const images = Array.isArray(input.input) ? input.input : [input.input];
    return images.map((image): Input => ({ content: [imageContent(image)] }));
  }
  const pairs = Array.isArray(input.input) ? input.input : [input.input];
  return pairs.map(
    (pair): Input => ({
      content: [imageContent(pair.image), { type: TEXT_TYPE, text: pair.text }],
    }),
  );
}

function embedErrorPrefix(model: string): string {
  return `openrouter imageEmbed (${model})`;
}

/**
 * Run a joint image/text embedding via the multimodal embeddings input. Fail-closes (typed `server`) on a
 * non-JSON body or an empty vector set; carries `model` back as the shared-space provenance.
 */
export async function runImageEmbed(client: OrImageEmbedClient, req: ImageEmbedRequest): Promise<ImageEmbedResult> {
  const requestBody: CreateEmbeddingsRequestBody = {
    model: req.model,
    input: buildEmbedInput(req),
  };
  let response: CreateEmbeddingsResponse;
  try {
    response = await client.embeddings.generate({ requestBody }, req.signal !== undefined ? { signal: req.signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, embedErrorPrefix(req.model));
  }
  if (typeof response === "string" || response.data.length === 0) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${embedErrorPrefix(req.model)}: image-embed response carried no vectors`,
    });
  }
  const ordered = [...response.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = ordered.map((entry) => toFloat32(entry.embedding));
  return { vectors, model: response.model };
}

function toFloat32(embedding: number[] | string): Float32Array<ArrayBuffer> {
  if (typeof embedding === "string") {
    const bytes = Buffer.from(embedding, BASE64);
    // Copy into a fresh, exactly-sized ArrayBuffer (4-byte aligned by construction): `Buffer` is a view
    // into a pooled, arbitrarily-offset ArrayBuffer, and a direct float32 view would RangeError.
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return new Float32Array(copy);
  }
  return new Float32Array(embedding);
}

// Parse one returned image URL → the cross-family `GeneratedImage`: a `data:` URL is split into mediaType +
// base64; an http URL passes through as a reference.
function parseGeneratedImage(url: string): GeneratedImage {
  if (!url.startsWith(DATA_URL_PREFIX)) {
    return { url, base64: undefined, mediaType: undefined };
  }
  const semicolon = url.indexOf(";");
  const comma = url.indexOf(",");
  const mediaType = semicolon > DATA_URL_PREFIX.length ? url.slice(DATA_URL_PREFIX.length, semicolon) : DEFAULT_IMAGE_MEDIA_TYPE;
  const base64 = comma >= 0 ? url.slice(comma + 1) : "";
  return { url: undefined, base64, mediaType };
}

function genErrorPrefix(model: string): string {
  return `openrouter generateImage (${model})`;
}

function buildGenMessages(req: ImageGenerateRequest): ChatMessages[] {
  const messages: ChatMessages[] = [];
  if (req.systemPrompt !== undefined && req.systemPrompt.length > 0) {
    messages.push({ role: SYSTEM_ROLE, content: req.systemPrompt });
  }
  messages.push({ role: USER_ROLE, content: req.prompt });
  return messages;
}

/**
 * Run a text→image generation as a chat turn with image modality. Reads the generated images off the
 * assistant message; fail-closes (typed `server`) when none are returned or the call unexpectedly streamed.
 */
export async function runGenerateImage(client: OrImageGenClient, req: ImageGenerateRequest): Promise<ImageGenerateResult> {
  const chatRequest: ChatRequest = {
    model: req.model,
    messages: buildGenMessages(req),
    modalities: [...IMAGE_TEXT_MODALITIES],
    ...(req.n !== undefined ? { n: req.n } : {}),
  };
  let result: SdkChatResult | AsyncIterable<ChatStreamChunk>;
  try {
    result = await client.chat.send({ chatRequest }, req.signal !== undefined ? { signal: req.signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, genErrorPrefix(req.model));
  }
  if (Symbol.asyncIterator in result) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${genErrorPrefix(req.model)}: expected a non-streaming image response`,
    });
  }
  const images = (result.choices.at(0)?.message.images ?? []).map((entry) => parseGeneratedImage(entry.imageUrl.url));
  if (images.length === 0) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${genErrorPrefix(req.model)}: image generation returned no images`,
    });
  }
  return { images, model: result.model, usage: { costUsd: result.usage?.cost ?? null } };
}
