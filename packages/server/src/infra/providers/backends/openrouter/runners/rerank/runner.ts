// infra/providers/backends/openrouter/runners/rerank/runner — the rerank role's HOSTED arm. Per the
// "rerank-hosted gap — RESOLVED" decision (tiers/providers.md): the rerank role's OpenRouter arm THROWS a
// typed not-supported error — flagged, NOT faked — until a rerank-specific provider (Cohere/Jina/Voyage) is
// wired; the local (vLLM / ONNX cross-encoder) backends remain the rerank path. The typed throw IS the
// contract, not a silent fallback.
//
// FLAG (orchestrator): `@openrouter/sdk` 0.13.19 DOES expose `client.rerank.rerank`, which contradicts the
// doc's "OpenRouter has no generic rerank endpoint" premise. The DOC WINS (it is authoritative over the SDK
// surface), so this stays a typed throw — but the decision likely warrants revisiting now that the SDK ships
// a rerank endpoint. Do NOT wire it without a deliberate ledger update.

import type { RerankRequest, RerankResult } from "../../../../contract";
import { ProviderError } from "../../../../contract";

/**
 * The OpenRouter rerank arm — a typed not-supported throw. Returns a rejected promise so the role
 * dispatcher surfaces a single `ProviderError` regardless of arm; never a silent empty result.
 */
export function runRerank(req: RerankRequest): Promise<RerankResult> {
  return Promise.reject(
    new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `openrouter offers no generic rerank endpoint; rerank model "${req.model}" must run on a local (vLLM / ONNX cross-encoder) backend or a rerank-specific provider`,
    }),
  );
}
