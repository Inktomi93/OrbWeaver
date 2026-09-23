// The `generateImage` task on the openai-compat wire — ONE task, the wire ARM chosen from the row (§6.7):
//   • `images-api` — the SDK's `ImageModelV4.doGenerate` (OpenAI `/v1/images/generations` + `/edits`,
//     OpenRouter `/images`), base64 bytes back;
//   • `chat-modalities` — a chat `doGenerate` with `modalities: ["text","image"]`, the pictures on the reply's
//     `file` parts (the arm for image-output CHAT models with no images-API listing).
// The edit BELT: an `edit` payload on a model whose capability lacks `imageEdit` is
// stripped whole with `image_edit_dropped` and the call falls back to text→image — never a throw. The
// negative prompt folds into the text on the chat arm (no hosted chat wire has a native negative field).

import type { ImageModelV4File } from "@ai-sdk/provider";
import { acceptsImageEdit, modelIdSchema } from "@orb/contracts/inference";
import type { ImageInput } from "@orb/contracts/role-clients";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { GeneratedImage, ImageGenerateRequest, ImageGenerateResult } from "../../contract/roles.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { toImageUrl } from "../v4/batch.ts";
import { measuredCostOf } from "../v4/result.ts";
import { generatedImageOf } from "../v4/stream.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { imageModelFor, languageModelFor } from "./model.ts";

const MAX_REFERENCE_IMAGES = 4;
const NEGATIVE_LINE_PREFIX = "\nDo not include: ";
const DEFAULT_N = 1;
const PNG_MEDIA = "image/png";
const DATA_URL_RE = /^data:(?<mime>[^;,]+);base64,(?<data>.*)$/su;

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
  const model = imageModelFor(call);
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
  return { images, model: modelIdSchema.parse(result.response.modelId), usage: { costUsd: null }, warnings };
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
  // An image result carries no V4 `usage.raw` — the BYOK split is a chat-usage fact; the total is what rides.
  const measured = measuredCostOf(result.providerMetadata, undefined);
  return { images, model: req.connection.model, usage: { costUsd: measured === null ? null : measured.costUsd }, warnings };
}

export async function runOpenAiCompatGenerateImage(req: ImageGenerateRequest, deps: ImagesDeps): Promise<ImageGenerateResult> {
  const { connection } = req;
  const label = `${connection.providerId} generateImage (${connection.model})`;
  const arm = connection.features.images ?? (connection.provider.dialect === "openrouter" ? "chat-modalities" : undefined);
  if (arm === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection's row declares no image-generation arm` });
  }
  const warnings: ResolvedWarning[] = [];
  const call: ModelCall = { connection, deps: deps.transport, label, api: "generateImage", plan: null, prefillAllowed: false, replyImages: false, warnings };
  try {
    return arm === "images-api" ? await runImagesApi(req, deps, call, warnings) : await runChatModalities(req, deps, call, warnings);
  } catch (err) {
    throw err instanceof ProviderError ? err : providerErrorFromHttp(err, label, resolvedScrubSet(connection));
  }
}
