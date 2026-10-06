// The `generateImage` task on the openai-compat wire — ONE task, the wire ARM chosen from the row (§6.7):
//   • `images-api` — the SDK's `ImageModelV4.doGenerate` (OpenAI `/v1/images/generations` + `/edits`,
//     OpenRouter `/images`), base64 bytes back;
//   • `chat-modalities` — a chat `doGenerate` with `modalities: ["text","image"]`, the pictures on the reply's
//     `file` parts (the arm for image-output CHAT models with no images-API listing).
// The edit BELT: an `edit` payload on a model whose capability lacks `imageEdit` is
// stripped whole with `image_edit_dropped` and the call falls back to text→image — never a throw. The
// negative prompt folds into the text on the chat arm (no hosted chat wire has a native negative field).

import type { ImageModelV4File } from "@ai-sdk/provider";
import type { GenerationUsage, ResponseCache, TokenDetails, TokenUsage } from "@orb/contracts/inference";
import { acceptsImageEdit } from "@orb/contracts/inference";
import type { ImageInput } from "@orb/contracts/role-clients";
import { z } from "zod";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { GeneratedImage, ImageGenerateRequest, ImageGenerateResult } from "../../contract/roles.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { toImageUrl } from "../kit/image-normalize.ts";
import { responseCacheOf } from "../kit/response-cache.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import type { MeasuredCost } from "../v4/result.ts";
import { generationUsageOf, measuredCostOf, rawMeasuredOpenRouterCostOf } from "../v4/result.ts";
import { generatedImageOf } from "../v4/stream.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { imageModelFor, languageModelFor } from "./model.ts";

const MAX_REFERENCE_IMAGES = 4;
const NEGATIVE_LINE_PREFIX = "\nDo not include: ";
const DEFAULT_N = 1;
const PNG_MEDIA = "image/png";
const DATA_URL_RE = /^data:(?<mime>[^;,]+);base64,(?<data>.*)$/su;
const reportedCount = z.number().int().nonnegative().nullish().catch(null);
const imageTokenDetailFieldsSchema = z.object({
  text_tokens: reportedCount,
  image_tokens: reportedCount,
  audio_tokens: reportedCount,
  video_tokens: reportedCount,
  file_tokens: reportedCount,
  cached_tokens: reportedCount,
  cache_write_tokens: reportedCount,
  reasoning_tokens: reportedCount,
});
const imageTokenDetailSchema = imageTokenDetailFieldsSchema.nullish().catch(null);
const imageResponseSchema = z.object({
  usage: z
    .looseObject({
      input_tokens: reportedCount,
      output_tokens: reportedCount,
      prompt_tokens: reportedCount,
      completion_tokens: reportedCount,
      input_tokens_details: imageTokenDetailSchema,
      output_tokens_details: imageTokenDetailSchema,
      prompt_tokens_details: imageTokenDetailSchema,
      completion_tokens_details: imageTokenDetailSchema,
    })
    .nullish()
    .catch(null),
});
const IMAGE_USAGE_MODALITIES = [
  ["text_tokens", "text"],
  ["image_tokens", "image"],
  ["audio_tokens", "audio"],
  ["video_tokens", "video"],
  ["file_tokens", "file"],
] as const;

function imageTokenDetails(details: z.infer<typeof imageTokenDetailFieldsSchema> | null | undefined): TokenDetails["input"] {
  if (details === null || details === undefined) {
    return;
  }
  const known = IMAGE_USAGE_MODALITIES.flatMap(([key, modality]) => {
    const tokens = details[key];
    return typeof tokens === "number" ? [{ modality, tokens }] : [];
  });
  return known.length === 0 ? undefined : known;
}

function imageApiTokenUsage(usage: z.infer<typeof imageResponseSchema>["usage"], openrouter: boolean): TokenUsage {
  const input = openrouter ? usage?.prompt_tokens_details : usage?.input_tokens_details;
  const output = openrouter ? usage?.completion_tokens_details : usage?.output_tokens_details;
  return {
    tokensIn: (openrouter ? usage?.prompt_tokens : usage?.input_tokens) ?? null,
    tokensOut: (openrouter ? usage?.completion_tokens : usage?.output_tokens) ?? null,
    cacheReadTokens: input?.cached_tokens ?? null,
    cacheWriteTokens: input?.cache_write_tokens ?? null,
    reasoningTokens: output?.reasoning_tokens ?? null,
  };
}

function normalizedImageUsage(
  usage: z.infer<typeof imageResponseSchema>["usage"],
  promptFields: boolean,
  measured: MeasuredCost | null,
  responseCache: ResponseCache | undefined,
): GenerationUsage {
  const input = promptFields ? usage?.prompt_tokens_details : usage?.input_tokens_details;
  const output = promptFields ? usage?.completion_tokens_details : usage?.output_tokens_details;
  const inputDetails = imageTokenDetails(input);
  const outputDetails = imageTokenDetails(output);
  const cost = measured ?? (responseCache?.status === "hit" ? { costUsd: 0, costDetails: { totalUsd: 0 } } : null);
  return {
    ...generationUsageOf(undefined, undefined, cost),
    ...imageApiTokenUsage(usage, promptFields),
    tokenDetails:
      inputDetails === undefined && outputDetails === undefined
        ? null
        : {
            ...(inputDetails === undefined ? {} : { input: inputDetails }),
            ...(outputDetails === undefined ? {} : { output: outputDetails }),
          },
    ...(responseCache === undefined ? {} : { responseCache }),
  };
}

/** Normalize only the reported accounting fields; the SDK still receives the original image response. */
function imageApiUsage(body: unknown, headers: Headers, openrouter: boolean, secrets: ProviderScrubSet): GenerationUsage {
  const raw = imageResponseSchema.safeParse(body);
  const usage = raw.success ? raw.data.usage : null;
  return normalizedImageUsage(
    usage,
    openrouter,
    openrouter ? rawMeasuredOpenRouterCostOf(usage) : null,
    openrouter ? responseCacheOf(Object.fromEntries(headers.entries()), secrets) : undefined,
  );
}

export interface ImagesDeps {
  readonly transport: TransportDeps;
  readonly normalize: NormalizeImageBytes;
}

function foldNegative(prompt: string, negativePrompt: string | undefined): string {
  return negativePrompt !== undefined && negativePrompt.length > 0 ? `${prompt}${NEGATIVE_LINE_PREFIX}${negativePrompt}` : prompt;
}

/** The edit belt: the init image + its references (clamped) when the capability admits an edit; else nothing
 *  and a warning. Returns the images the arm sends and whether a mask was dropped. */
function editSources(req: ImageGenerateRequest, warnings: ResolvedWarning[]): readonly ImageInput[] {
  const edit = req.edit;
  if (edit === undefined) {
    return [];
  }
  const capability = req.connection.capability;
  if (capability.kind !== "generation" || !acceptsImageEdit(capability.generation)) {
    warnings.push({
      code: "image_edit_dropped",
      message: `${req.connection.model} lacks image-edit capability; generated text→image without the edit/reference input`,
    });
    return [];
  }
  const sources = [...(edit.image !== undefined ? [edit.image] : []), ...(edit.references ?? []).slice(0, MAX_REFERENCE_IMAGES)];
  if (sources.length === 0) {
    warnings.push({ code: "image_edit_dropped", message: `${req.connection.model}: the edit carried no image this wire can use; generated text→image` });
  }
  return sources;
}

async function toImageFile(image: ImageInput, normalize: NormalizeImageBytes): Promise<ImageModelV4File> {
  if (typeof image === "string") {
    const match = DATA_URL_RE.exec(image);
    if (match?.groups !== undefined) {
      return { type: "file", mediaType: match.groups["mime"] ?? PNG_MEDIA, data: match.groups["data"] ?? "" };
    }
    throw new ProviderError({ kind: "invalid", retryable: false, message: "the images API takes image BYTES or a data URL, not a remote URL" });
  }
  const { bytes, mediaType } = await normalize(image);
  return { type: "file", mediaType, data: bytes };
}

async function runImagesApi(req: ImageGenerateRequest, deps: ImagesDeps, call: ModelCall, warnings: ResolvedWarning[]): Promise<ImageGenerateResult> {
  const sources = editSources(req, warnings);
  const files = await Promise.all(sources.map((image) => toImageFile(image, deps.normalize)));
  const mask = req.edit?.mask !== undefined && sources.length > 0 ? await toImageFile(req.edit.mask, deps.normalize) : undefined;
  let usage = generationUsageOf(undefined, undefined, null);
  const model = imageModelFor({
    ...call,
    translateResponse: async (response) => {
      if (!response.ok) {
        return response;
      }
      const bytes = await response.text();
      // ImageModelV4 drops the raw usage; this per-call normalized value settles before its result returns.
      usage = imageApiUsage(JSON.parse(bytes), response.headers, req.connection.provider.dialect === "openrouter", resolvedScrubSet(req.connection));
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
  const result = await model.doGenerate({
    prompt: foldNegative(req.prompt, req.negativePrompt),
    n: req.n ?? DEFAULT_N,
    size: req.size !== undefined ? `${req.size.width}x${req.size.height}` : undefined,
    aspectRatio: undefined,
    seed: undefined,
    files: files.length > 0 ? files : undefined,
    mask,
    providerOptions: {},
    ...(req.signal !== undefined ? { abortSignal: req.signal } : {}),
  });
  const images: GeneratedImage[] = result.images.map((image) => ({
    url: undefined,
    base64: typeof image === "string" ? image : Buffer.from(image).toString("base64"),
    mediaType: PNG_MEDIA,
  }));
  if (images.length === 0) {
    throw new ProviderError({ kind: "server", retryable: result.isRetryable ?? true, message: `${call.label}: image generation returned no images` });
  }
  return { images, model: req.connection.model, usage, warnings };
}

async function runChatModalities(req: ImageGenerateRequest, deps: ImagesDeps, call: ModelCall, warnings: ResolvedWarning[]): Promise<ImageGenerateResult> {
  const sources = editSources(req, warnings);
  if (req.edit?.mask !== undefined && sources.length > 0) {
    warnings.push({
      code: "image_edit_dropped",
      message: `${req.connection.model}: the chat-completions image wire has no inpaint-mask channel; the mask was dropped`,
    });
  }
  const urls = await Promise.all(sources.map((image) => toImageUrl(image, deps.normalize)));
  const model = languageModelFor({ ...call, replyImages: true });
  const result = await model.doGenerate({
    prompt: [
      ...(req.systemPrompt !== undefined && req.systemPrompt.length > 0 ? [{ role: "system" as const, content: req.systemPrompt }] : []),
      {
        role: "user",
        content: [
          ...urls.map((url) => ({ type: "file" as const, mediaType: "image" as const, data: { type: "url" as const, url: new URL(url) } })),
          { type: "text", text: foldNegative(req.prompt, req.negativePrompt) },
        ],
      },
    ],
    ...(req.signal !== undefined ? { abortSignal: req.signal } : {}),
  });
  const images = result.content.flatMap((part) => (part.type === "file" ? (generatedImageOf(part) ?? []) : []));
  if (images.length === 0) {
    throw new ProviderError({ kind: "server", retryable: true, message: `${call.label}: image generation returned no images` });
  }
  const measured = measuredCostOf(result.providerMetadata, result.usage.raw);
  const raw = imageResponseSchema.safeParse({ usage: result.usage.raw });
  const responseCache =
    req.connection.provider.dialect === "openrouter" ? responseCacheOf(result.response?.headers, resolvedScrubSet(req.connection)) : undefined;
  const usage = normalizedImageUsage(raw.success ? raw.data.usage : null, true, measured, responseCache);
  return { images, model: req.connection.model, usage: { ...usage, servedModel: result.response?.modelId ?? null }, warnings };
}

export async function runOpenAiCompatGenerateImage(req: ImageGenerateRequest, deps: ImagesDeps): Promise<ImageGenerateResult> {
  const { connection } = req;
  const label = `${connection.providerId} generateImage (${connection.model})`;
  const arm = connection.features.images ?? (connection.provider.dialect === "openrouter" ? "chat-modalities" : undefined);
  if (arm === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection's row declares no image-generation arm` });
  }
  const warnings: ResolvedWarning[] = [];
  const call: ModelCall = {
    connection,
    deps: deps.transport,
    label,
    api: "generateImage",
    plan: null,
    prefillAllowed: false,
    templateThinking: undefined,
    templatePreserveReasoning: undefined,
    foldSameRole: false,
    replyImages: false,
    warnings,
    responseCache: { enabled: false },
  };
  try {
    return arm === "images-api" ? await runImagesApi(req, deps, call, warnings) : await runChatModalities(req, deps, call, warnings);
  } catch (err) {
    throw err instanceof ProviderError ? err : providerErrorFromHttp(err, label, resolvedScrubSet(connection));
  }
}
