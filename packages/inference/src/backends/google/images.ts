import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import type { GenerationUsage } from "@orb/contracts/inference";
import { acceptsImageEdit } from "@orb/contracts/inference";
import { ProviderError } from "../../contract/errors.ts";
import type { GoogleBackendDeps } from "../../contract/google.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { ImageGenerateRequest, ImageGenerateResult } from "../../contract/roles.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import { createImageNormalizer, passthroughImageNormalizer, toImageUrl } from "../kit/image-normalize.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { mediaFilePart } from "../v4/prompt.ts";
import { generationUsageOf, measuredCostOf, sdkWarnings } from "../v4/result.ts";
import { generatedImageOf } from "../v4/stream.ts";
import { requireGoogleGeneration } from "./chat.ts";
import { GOOGLE_KEY, googleModelId, googleProviderFor } from "./model.ts";
import { googleExtras } from "./options.ts";
import { googleServedModelOf, googleTokenDetailsOf, googleTokenUsageOf } from "./usage.ts";

function imageUsageOf(result: LanguageModelV4GenerateResult): GenerationUsage {
  const measured = measuredCostOf(result.providerMetadata, result.usage.raw);
  // Google 4.0.87 drops modelVersion from response.modelId, but retains the actual response body.
  const servedModel = googleServedModelOf(result.response?.body);
  return {
    ...generationUsageOf(result.usage, servedModel ?? undefined, measured),
    ...googleTokenUsageOf(result.usage.raw),
    tokenDetails: googleTokenDetailsOf(result.usage.raw),
  };
}

export async function runGoogleGenerateImage(req: ImageGenerateRequest, deps: GoogleBackendDeps): Promise<ImageGenerateResult> {
  const { connection } = req;
  const generation = requireGoogleGeneration(connection);
  if (!generation.output.modalities.includes("image")) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google connection cannot generate images" });
  }
  const label = `${connection.providerId} generateImage (${connection.model})`;
  const warnings: ResolvedWarning[] = [];
  if (req.edit?.mask !== undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google image editing does not support masks" });
  }
  if (req.n !== undefined && req.n !== 1) {
    warnings.push({ code: "sdk_unsupported_setting", message: "Google generates one image response per request; n was ignored" });
  }
  const imagesIn = imageSources(req, warnings);
  const normalize = deps.imageToPng === undefined ? passthroughImageNormalizer : createImageNormalizer(deps.imageToPng);
  try {
    const files = await Promise.all(imagesIn.map(async (image) => mediaFilePart({ kind: "image", url: await toImageUrl(image, normalize) })));
    const prompt = req.negativePrompt === undefined ? req.prompt : `${req.prompt}\nDo not include: ${req.negativePrompt}`;
    const result = await googleProviderFor({ connection, deps, label, api: "generateImage" })
      .chat(googleModelId(connection.model))
      .doGenerate({
        prompt: [
          ...(req.systemPrompt === undefined ? [] : [{ role: "system" as const, content: req.systemPrompt }]),
          { role: "user", content: [{ type: "text", text: prompt }, ...files] },
        ],
        providerOptions: {
          [GOOGLE_KEY]: {
            ...googleExtras(connection, warnings),
            responseModalities: ["TEXT", "IMAGE"],
            ...(req.size === undefined ? {} : { imageConfig: { aspectRatio: aspectRatioOf(req.size.width, req.size.height) } }),
          },
        },
        ...(req.signal === undefined ? {} : { abortSignal: req.signal }),
      });
    warnings.push(...sdkWarnings(result.warnings));
    if (result.finishReason.unified === "content-filter") {
      throw new ProviderError({ kind: "refused", retryable: false, message: `${label}: content filter refused image generation` });
    }
    const images = result.content.flatMap((part) => (part.type === "file" ? (generatedImageOf(part) ?? []) : []));
    if (images.length === 0) {
      throw new ProviderError({ kind: "server", retryable: false, message: `${label}: image generation returned no images` });
    }
    return { images, model: connection.model, usage: imageUsageOf(result), warnings };
  } catch (err) {
    throw err instanceof ProviderError ? err : providerErrorFromHttp(err, label, resolvedScrubSet(connection));
  }
}

function imageSources(req: ImageGenerateRequest, warnings: ResolvedWarning[]): readonly (Uint8Array | string)[] {
  const generation = requireGoogleGeneration(req.connection);
  const edit = acceptsImageEdit(generation) ? req.edit : undefined;
  if (req.edit !== undefined && edit === undefined) {
    warnings.push({ code: "image_edit_dropped", message: "The model cannot edit images; generated from text" });
  }
  return [...(edit?.image === undefined ? [] : [edit.image]), ...(edit?.references ?? [])];
}

function aspectRatioOf(width: number, height: number): string {
  let a = width;
  let b = height;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return `${width / a}:${height / a}`;
}
