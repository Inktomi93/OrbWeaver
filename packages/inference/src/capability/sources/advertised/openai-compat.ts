// The ADVERTISED tier from an OpenAI-compatible `/v1/models` row: ids and, when the server reports one, a chat
// model's context window (vLLM `max_model_len`, LM Studio `max_context_length`, llama.cpp `meta.n_ctx`, Ollama's
// pinned `num_ctx`, else its default floor as assumed), an embedder's width, and — where the row's native model-info API states them (D292) — the
// modalities a turn may carry, whether the model takes `tools[]`, and schema-constrained output. Everything else
// is curated or declared (§5.7, §6.3).

import type { CapabilityOverride, EmbeddingCapability, ModelKind } from "@orb/contracts/inference";
import type { EndpointModel } from "../../../contract/runtime.ts";

type GenerationPatch = NonNullable<CapabilityOverride["generation"]>;

/** A stated window is reported; a server's floor for an unstated one stays assumed, so the editor marks it and
 *  the user is told to correct it. */
function advertisedContext(entry: Pick<EndpointModel, "contextLength" | "contextFloor">): Pick<GenerationPatch, "context"> {
  if (entry.contextLength !== null) {
    return { context: { window: entry.contextLength } };
  }
  return entry.contextFloor === undefined ? {} : { context: { window: entry.contextFloor, windowEstimated: true } };
}

export function advertisedFromOpenAiCompat(
  entry: Pick<EndpointModel, "contextLength" | "contextFloor" | "embeddingDims" | "input" | "tools" | "structured">,
  kind: ModelKind,
): GenerationPatch | Partial<EmbeddingCapability> {
  if (kind === "embedding") {
    return entry.embeddingDims === undefined ? {} : { dims: entry.embeddingDims };
  }
  if (kind !== "generation") {
    return {};
  }
  return {
    ...advertisedContext(entry),
    ...(entry.input === undefined ? {} : { input: [...entry.input] }),
    ...(entry.tools === undefined ? {} : { tools: { parallel: entry.tools.parallel } }),
    ...(entry.structured === true ? { output: { structured: true } } : {}),
  };
}

/** Whether the advertised tier states what a turn may carry — the D292 bit the endpoint posture reads. */
export function advertisedStatesInput(entry: Pick<EndpointModel, "input"> | undefined): boolean {
  return entry?.input !== undefined;
}
