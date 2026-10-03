// The ADVERTISED tier from an OpenAI-compatible `/v1/models` row: ids and, when the server reports one, a chat
// model's context window (vLLM `max_model_len`, LM Studio `max_context_length`, Ollama's native `num_ctx`) or
// an embedder's width (Ollama's native `embedding_length`). Everything else is curated or declared (§5.7, §6.3).

import type { EmbeddingCapability, GenerationCapability, ModelKind } from "@orb/contracts/inference";
import type { EndpointModel } from "../../../contract/runtime.ts";

export function advertisedFromOpenAiCompat(
  entry: Pick<EndpointModel, "contextLength" | "embeddingDims">,
  kind: ModelKind,
): Partial<GenerationCapability> | Partial<EmbeddingCapability> {
  if (kind === "embedding") {
    return entry.embeddingDims === undefined ? {} : { dims: entry.embeddingDims };
  }
  return kind === "generation" && entry.contextLength !== null ? { context: { window: entry.contextLength } } : {};
}
