// infra/providers/backends/openrouter/runners/embed/runner — text embedding over OpenRouter's
// `embeddings.generate`. Carries `dimensions` through (MRL truncation, so a hosted Qwen embed can match the
// vLLM 1024-dim space) and `model` through (the embedding-space provenance the `embeddings` domain tags).
// Converts the SDK's `number[]` OR base64 embedding into the `Float32Array` the store consumes. Imports
// `backends/kit` DOWN; never a sibling backend.

import type { CreateEmbeddingsRequestBody, CreateEmbeddingsResponse } from "@openrouter/sdk/models/operations";
import type { EmbedRequest, EmbedResult } from "../../../../contract";
import { ProviderError } from "../../../../contract";
import { providerErrorFromHttp } from "../../../kit";

const BASE64 = "base64";

// The structural slice this runner needs off the client port.
interface OrEmbedClient {
  readonly embeddings: {
    readonly generate: (
      request: { readonly requestBody: CreateEmbeddingsRequestBody },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<CreateEmbeddingsResponse>;
  };
}

// Convert one SDK embedding (a `number[]` for `encoding_format:"float"`, or a base64 string) → a
// `Float32Array`. The base64 path `.slice`s out an exact, 4-byte-aligned copy first: `Buffer.from` returns
// a view into a POOLED ArrayBuffer at an arbitrary `byteOffset`, and a direct float32 view of a misaligned
// offset would `RangeError`.
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

function errorPrefix(model: string): string {
  return `openrouter embed (${model})`;
}

/**
 * Run a text-embedding request. Sorts the returned data by `index` (providers may return out of order),
 * converts each embedding to a `Float32Array`, and fail-closes (typed `server` error) on a non-JSON
 * (string) body or an empty vector set. Carries `dimensions`/`inputType` to the wire and `model` back as
 * the embedding-space provenance.
 */
export async function runEmbed(client: OrEmbedClient, req: EmbedRequest): Promise<EmbedResult> {
  const requestBody: CreateEmbeddingsRequestBody = {
    model: req.model,
    input: typeof req.input === "string" ? req.input : [...req.input],
    ...(req.dimensions !== undefined ? { dimensions: req.dimensions } : {}),
    ...(req.inputType !== undefined ? { inputType: req.inputType } : {}),
  };
  let response: CreateEmbeddingsResponse;
  try {
    response = await client.embeddings.generate({ requestBody }, req.signal !== undefined ? { signal: req.signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, errorPrefix(req.model));
  }
  if (typeof response === "string") {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${errorPrefix(req.model)}: unexpected non-JSON embeddings response`,
    });
  }
  if (response.data.length === 0) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${errorPrefix(req.model)}: embeddings response carried no vectors`,
    });
  }
  const ordered = [...response.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = ordered.map((entry) => toFloat32(entry.embedding));
  return {
    vectors,
    model: response.model,
    usage: {
      promptTokens: response.usage?.promptTokens ?? null,
      totalTokens: response.usage?.totalTokens ?? null,
    },
  };
}
