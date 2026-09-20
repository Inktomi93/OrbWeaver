// The ADVERTISED tier from an OpenAI-compatible `/v1/models` row: ids and, when the server reports one, a
// context window (vLLM's `max_model_len`, LM Studio's `max_context_length`). NO OpenAI-compatible list
// carries a kind or modalities — OpenAI, Groq, Ollama and vLLM all return `{id, object, created, owned_by}`
// — so everything else is curated or declared (§5.7 `kindOf`, §6.3 the endpoint row).

import type { GenerationCapability } from "@orb/contracts/inference";

export function advertisedFromOpenAiCompat(entry: { readonly contextLength: number | null }): Partial<GenerationCapability> {
  return entry.contextLength !== null ? { context: { window: entry.contextLength } } : {};
}
