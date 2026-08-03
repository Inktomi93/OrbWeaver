// infra/providers/backends/local-light/rerank — the local-light RERANK role (ONNX cross-encoder via
// transformers.js sequence-classification). A PURE transform over the model cache: documents are keyed
// by CALLER ids (never array indices — results stay stable across reorderings), empty-text documents are
// filtered before scoring, the raw cross-encoder logit is the relevance score (sorted descending), and
// `topN` truncates. The ONNX cross-encoder is TEXT-ONLY: a query/doc image is ignored (no-op knob); a
// query with no text can't be scored and fails loud. Carries `model` provenance. No vector math here.

import type { RerankQuery } from "@orb/contracts/role-clients";
import type { RerankRequest, RerankResult } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import type { LocalLightModelCache } from "./model-cache.ts";
import { resolveModelId, throwIfAborted } from "./model-cache.ts";

/** The "any box" default cross-encoder reranker (MS MARCO MiniLM). Overridable via `req.model`. */
export const DEFAULT_RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";

/** Extract the text side of a rerank query (string, or the `.text` of a multimodal query object). The
 *  text-only cross-encoder ignores any `image` (no-op knob doctrine). */
function rerankQueryText(query: RerankQuery): string {
  return (typeof query === "string" ? query : (query.text ?? "")).trim();
}

/** Bind the rerank role to a model cache (the real transformers.js cache, or a test fake). */
export function createLocalLightRerank(cache: LocalLightModelCache): (req: RerankRequest) => Promise<RerankResult> {
  return async (req) => {
    throwIfAborted(req.signal);
    const modelId = resolveModelId(req.model, DEFAULT_RERANK_MODEL);

    const baseQuery = rerankQueryText(req.query);
    if (baseQuery.length === 0) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: "local-light rerank requires query text (the ONNX cross-encoder is text-only)",
      });
    }
    // Instruction-aware rerankers (Qwen3-Reranker) consume a literal `<Instruct>`-style prefix on the
    // query; the default MS MARCO cross-encoder treats this as identity when no instruction is given.
    const query = req.instruction !== undefined && req.instruction.length > 0 ? `${req.instruction} ${baseQuery}` : baseQuery;

    // Empty-text documents can't be scored by a text cross-encoder — filter before scoring (contract).
    const kept = req.documents.filter((doc) => (doc.text ?? "").trim().length > 0);
    if (kept.length === 0) {
      return { hits: [], model: modelId, usage: { totalTokens: null } };
    }

    const scores = await cache.scorePairs(
      modelId,
      query,
      kept.map((doc) => doc.text ?? ""),
    );
    throwIfAborted(req.signal);

    const hits = kept.map((doc, i) => ({ id: doc.id, score: scores[i] ?? 0 })).sort((a, b) => b.score - a.score);
    // `topN` undefined → all scored docs; otherwise the top-N (clamped non-negative for slice safety).
    const limited = req.topN === undefined ? hits : hits.slice(0, Math.max(0, req.topN));

    // In-process inference is unmetered → null token usage (the RerankResult contract).
    return { hits: limited, model: modelId, usage: { totalTokens: null } };
  };
}
