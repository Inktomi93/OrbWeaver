// infra/providers/backends/openrouter/runners/embed/runner — text embedding over OpenRouter's
// `embeddings.generate`. Carries `dimensions` through (MRL truncation, so a hosted Qwen embed can match the
// vLLM 1024-dim space) and `model` through (the embedding-space provenance the `embeddings` domain tags).
// Converts the SDK's `number[]` OR base64 embedding into the `Float32Array` the store consumes. Imports
// `backends/kit` DOWN; never a sibling backend.

import type { CreateEmbeddingsRequestBody, CreateEmbeddingsResponse } from "@openrouter/sdk/models/operations";
import type { EmbedRequest, EmbedResult } from "../../../../contract/index.ts";
import { ProviderError } from "../../../../contract/index.ts";
import { decodeEmbeddingVectors, providerCredentialSecretValues, providerErrorFromHttp } from "../../../kit/index.ts";

// The structural slice this runner needs off the client port.
interface OrEmbedClient {
  readonly embeddings: {
    readonly generate: (
      request: { readonly requestBody: CreateEmbeddingsRequestBody },
      options?: { readonly signal?: AbortSignal },
    ) => Promise<CreateEmbeddingsResponse>;
  };
}

function errorPrefix(model: string): string {
  return `openrouter embed (${model})`;
}

/**
 * Run a text-embedding request. Sorts the returned data by `index` (providers may return out of order),
 * decodes each embedding through the shared alignment/width-checked decoder, and fail-closes on a non-JSON
 * (string) body or an empty vector set (typed `server`) and on a malformed/wrong-width payload (typed
 * `invalid`). Carries `dimensions`/`inputType` to the wire and `model` back as the embedding-space
 * provenance.
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
    throw providerErrorFromHttp(err, errorPrefix(req.model), providerCredentialSecretValues(req.credential));
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
  const ordered = response.data.toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0));
  // The COUNT is checked against the inputs the request actually sent (a lone string is one input): a short
  // or long list re-pairs every vector after the gap, positionally, with nothing downstream able to see it.
  const inputCount = typeof req.input === "string" ? 1 : req.input.length;
  const vectors = decodeEmbeddingVectors(
    ordered.map((entry) => entry.embedding),
    errorPrefix(req.model),
    inputCount,
    req.dimensions,
  );
  return {
    vectors,
    model: response.model,
    usage: {
      promptTokens: response.usage?.promptTokens ?? null,
      totalTokens: response.usage?.totalTokens ?? null,
    },
  };
}
