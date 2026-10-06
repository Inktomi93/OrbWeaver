import type { GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import type { EmbeddingModelV4, EmbeddingModelV4Result, JSONObject } from "@ai-sdk/provider";
import type { EmbeddingCapability } from "@orb/contracts/inference";
import { canEmbedImages } from "@orb/contracts/inference";
import type { EmbedResult, EmbedUsage, ImageEmbedResult } from "@orb/contracts/providers";
import type { ImageInput } from "@orb/contracts/role-clients";
import { clampToTokenBudget, safeTokenWindow } from "@orb/kit/tokens";
import { z } from "zod";
import { ProviderError } from "../../contract/errors.ts";
import type { GoogleBackendDeps } from "../../contract/google.ts";
import type { EmbedRequest, ImageEmbedRequest } from "../../contract/roles.ts";
import { embedRequestTimeoutMs } from "../../contract/roles.ts";
import { embeddingCostOf } from "../kit/embedding-cost.ts";
import { embeddingPrompt, fitToDim } from "../kit/embedding-input.ts";
import { providerErrorFromHttp } from "../kit/error-classify.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import { createImageNormalizer, passthroughImageNormalizer, toImageUrl } from "../kit/image-normalize.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { mediaFilePart } from "../v4/prompt.ts";
import { GOOGLE_KEY, googleModelId, googleProviderFor } from "./model.ts";

const INPUT_RESERVE_TOKENS = 64;
// GenerateContent embedContent/batchEmbedContents raw response, not the Interactions usage shape.
// The installed SDK leaves usage undefined but retains this actual API response in response.body.
const embeddingResponseUsageSchema = z.object({
  usageMetadata: z.object({ promptTokenCount: z.number().int().nonnegative().optional() }).optional(),
});
const IMAGE_URL_MIMES: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);
type EmbeddingParts = NonNullable<NonNullable<GoogleEmbeddingModelOptions["content"]>[number]>;
interface EmbeddingInput {
  readonly text: string;
  readonly parts?: EmbeddingParts;
}

async function imageParts(image: ImageInput, deps: GoogleBackendDeps): Promise<EmbeddingParts> {
  const normalize = deps.imageToPng === undefined ? passthroughImageNormalizer : createImageNormalizer(deps.imageToPng);
  const file = mediaFilePart({ kind: "image", url: await toImageUrl(image, normalize) });
  if (file.data.type === "url") {
    const extension = file.data.url.pathname.split(".").at(-1)?.toLowerCase() ?? "";
    const mimeType = IMAGE_URL_MIMES.get(extension);
    if (mimeType === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "Google image embedding requires a typed image URL, bytes or a data URL" });
    }
    return [{ fileData: { fileUri: file.data.url.toString(), mimeType } }];
  }
  if (file.data.type === "data") {
    return [
      { inlineData: { mimeType: file.mediaType, data: typeof file.data.data === "string" ? file.data.data : Buffer.from(file.data.data).toString("base64") } },
    ];
  }
  throw new ProviderError({ kind: "invalid", retryable: false, message: "Google embedding requires image bytes or a URL" });
}

interface KeptInput {
  readonly index: number;
  readonly text: string;
  readonly parts: EmbeddingParts | undefined;
}

function keptInputs(req: EmbedRequest, inputs: readonly (EmbeddingInput | null)[], deps: GoogleBackendDeps, capability: EmbeddingCapability): KeptInput[] {
  const log = providerLogger(deps.log, req.connection.wire, req.connection.providerId);
  return inputs.flatMap((input, index) => {
    if (input === null) {
      return [];
    }
    const text = clampToTokenBudget(input.text, safeTokenWindow(capability.maxInputTokens) - INPUT_RESERVE_TOKENS);
    if (text.length !== input.text.length) {
      log.emit("warn", "provider.embed-clamped", { model: req.connection.model, index, chars: input.text.length, clampedToChars: text.length });
    }
    return [{ index, text: input.parts === undefined ? embeddingPrompt(text, req, capability) : text, parts: input.parts }];
  });
}

interface BatchContext {
  readonly vectors: (Float32Array<ArrayBuffer> | null)[];
  readonly dimension: number;
  readonly capability: EmbeddingCapability;
  readonly label: string;
}
function storeBatch(batch: readonly KeptInput[], embeddings: readonly number[][], context: BatchContext): void {
  const { vectors, dimension, capability, label } = context;
  if (embeddings.length !== batch.length) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: embedding count does not match input count` });
  }
  for (const [index, vector] of embeddings.entries()) {
    if (capability.mrl && vector.length !== dimension) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `${label}: embedding width ${vector.length} differs from requested ${dimension}`,
        width: { stated: dimension, measured: vector.length },
      });
    }
    const input = batch[index];
    if (input !== undefined) {
      vectors[input.index] = fitToDim(vector, { dims: dimension, mrl: capability.mrl }, label);
    }
  }
}

async function observeGoogleBatch(req: EmbedRequest, batch: readonly KeptInput[], result: EmbeddingModelV4Result): Promise<number | null> {
  const parsed = embeddingResponseUsageSchema.safeParse(result.response?.body);
  const count = parsed.success ? (parsed.data.usageMetadata?.promptTokenCount ?? null) : null;
  const textOnly = batch.every((input) => input.parts === undefined);
  await req.embeddingAccounting?.recordBatch({
    inputCount: batch.length,
    inputModalities: textOnly ? ["text"] : ["image", ...(batch.some((input) => input.text.length > 0) ? ["text" as const] : [])],
    servedModel: null,
    usage: { promptTokens: count, totalTokens: null },
    tokenDetails: null,
    cost: embeddingCostOf(count, req.connection.features.pricing, null, textOnly),
  });
  return count;
}

async function runBatches(model: EmbeddingModelV4, req: EmbedRequest, kept: readonly KeptInput[], context: BatchContext): Promise<EmbedUsage> {
  const { capability, dimension } = context;
  const limit = (await Promise.resolve(model.maxEmbeddingsPerCall)) ?? kept.length;
  const options: JSONObject = {
    ...(capability.mrl ? { outputDimensionality: dimension } : {}),
    ...(capability.retrievalTaskType === true ? { taskType: req.inputType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" } : {}),
  };
  let promptTokens: number | null = 0;
  for (let start = 0; start < kept.length; start += limit) {
    const batch = kept.slice(start, start + limit);
    const idle = turnAbortSignal(req.signal, embedRequestTimeoutMs(req.connection.features));
    const content = batch.some((input) => input.parts !== undefined) ? { content: batch.map((input) => input.parts ?? null) } : {};
    try {
      const result = await model.doEmbed({
        values: batch.map((input) => input.text),
        abortSignal: idle.signal,
        providerOptions: { [GOOGLE_KEY]: { ...options, ...content } },
      });
      const count = await observeGoogleBatch(req, batch, result);
      storeBatch(batch, result.embeddings, context);
      promptTokens = promptTokens !== null && count !== null ? promptTokens + count : null;
    } finally {
      idle.dispose();
    }
  }
  return { promptTokens, totalTokens: null };
}

async function embedInputs(req: EmbedRequest, inputs: readonly (EmbeddingInput | null)[], deps: GoogleBackendDeps): Promise<EmbedResult> {
  const { connection } = req;
  if (connection.capability.kind !== "embedding") {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google embedding requires an embedding model" });
  }
  const capability = connection.capability.embedding;
  const label = `${connection.providerId} embed (${connection.model})`;
  const dimension = req.dimensions ?? capability.dims;
  const vectors: (Float32Array<ArrayBuffer> | null)[] = new Array(inputs.length).fill(null);
  const kept = keptInputs(req, inputs, deps, capability);
  if (kept.length === 0) {
    return { vectors, model: connection.model, usage: { promptTokens: null, totalTokens: null } };
  }
  try {
    const model = googleProviderFor({ connection, deps, label, api: "embed" }).embedding(googleModelId(connection.model));
    const usage = await runBatches(model, req, kept, { vectors, dimension, capability, label });
    return { vectors, model: connection.model, usage };
  } catch (err) {
    throw err instanceof ProviderError ? err : providerErrorFromHttp(err, label, resolvedScrubSet(connection));
  }
}

export function runGoogleEmbed(req: EmbedRequest, deps: GoogleBackendDeps): Promise<EmbedResult> {
  const input = typeof req.input === "string" ? [req.input] : req.input;
  return embedInputs(
    req,
    input.map((text) => (text.trim().length === 0 ? null : { text })),
    deps,
  );
}

export async function runGoogleImageEmbed(req: ImageEmbedRequest, deps: GoogleBackendDeps): Promise<ImageEmbedResult> {
  if (req.connection.capability.kind !== "embedding" || !canEmbedImages(req.connection.capability.embedding)) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google connection does not support image embedding" });
  }
  const input = req.input;
  const connection = { ...req.connection, task: "embed" as const };
  if (input.kind === "text") {
    return runGoogleEmbed(
      { connection, input: input.input, inputType: "query", instruction: input.instruction, signal: req.signal, embeddingAccounting: req.embeddingAccounting },
      deps,
    );
  }
  const inputs: EmbeddingInput[] =
    input.kind === "image"
      ? await Promise.all((Array.isArray(input.input) ? input.input : [input.input]).map(async (image) => ({ text: "", parts: await imageParts(image, deps) })))
      : await Promise.all(
          (Array.isArray(input.input) ? input.input : [input.input]).map(async (pair) => ({ text: pair.text, parts: await imageParts(pair.image, deps) })),
        );
  return embedInputs({ connection, input: [], inputType: "document", signal: req.signal, embeddingAccounting: req.embeddingAccounting }, inputs, deps);
}
