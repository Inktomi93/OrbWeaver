// infra/providers/backends/openrouter/runners/rerank/runner — the rerank role's HOSTED arm, over
// OpenRouter's `rerank.rerank` endpoint (PD-11: WIRED 2026-06-28; the prior "OpenRouter has no generic
// rerank endpoint" premise was stale — `@openrouter/sdk` ships `client.rerank.rerank`). The local
// (vLLM / ONNX cross-encoder) backends remain the DEFAULT keyless rerank path; this arm serves when a
// role resolves to OpenRouter. Imports `backends/kit` DOWN; never a sibling backend.
//
// OpenRouter rerank is TEXT-ONLY: the wire `query` is a string and each document is scored on its text.
// An image-only query (no text) is a typed `ProviderError({kind:"invalid"})` — this backend cannot serve
// it. Empty-text documents are filtered before scoring (the `RerankResult` contract), so OpenRouter's
// returned `index` is into the SENT slice — we map it back to the caller's stable `documents[].id` via the
// sent-order list, never the raw request order.

import type { CreateRerankRequestBody, CreateRerankResponse } from "@openrouter/sdk/models/operations";
import type { RerankQuery } from "@orb/contracts/role-clients";
import type { RerankRequest, RerankResult } from "../../../../contract/index.ts";
import { ProviderError } from "../../../../contract/index.ts";
import { providerErrorFromHttp } from "../../../kit/index.ts";

// The structural slice this runner needs off the client port.
interface OrRerankClient {
  readonly rerank: {
    readonly rerank: (request: { readonly requestBody: CreateRerankRequestBody }, options?: { readonly signal?: AbortSignal }) => Promise<CreateRerankResponse>;
  };
}

function errorPrefix(model: string): string {
  return `openrouter rerank (${model})`;
}

// Resolve the text side of a RerankQuery. OpenRouter rerank is text-only: a string query is itself; an
// object query uses `.text`. An image-only (or empty) query is a typed `invalid` — not a crash.
function resolveQueryText(query: RerankQuery, model: string): string {
  const text = typeof query === "string" ? query : query.text;
  if (text === undefined || text.trim() === "") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${errorPrefix(model)}: query has no text; OpenRouter rerank is text-only (image-only queries need a local multimodal reranker)`,
    });
  }
  return text;
}

/**
 * Run a rerank request over OpenRouter's `rerank.rerank`. Resolves the query text and each document's
 * text (empty-text documents are filtered before scoring, per the {@link RerankResult} contract), calls
 * the endpoint with `topN` carried through, and maps the scored `results` back to {@link RerankResult}
 * hits — each hit preserves the caller's document id (OpenRouter returns an `index` into the SENT slice,
 * which we resolve via the sent-order list, never the raw request order). Hits are sorted descending by
 * score. Fail-closes (typed `server` error) on a non-JSON (string) body.
 */
export async function runRerank(client: OrRerankClient, req: RerankRequest): Promise<RerankResult> {
  const query = resolveQueryText(req.query, req.model);
  // Only text-bearing documents are sendable to the text-only endpoint; track each sent doc's caller id so
  // the response `index` (into THIS slice) maps back to a stable id.
  const sent = req.documents.filter((doc): doc is RerankRequest["documents"][number] & { text: string } => doc.text !== undefined && doc.text.trim() !== "");
  const requestBody: CreateRerankRequestBody = {
    model: req.model,
    query,
    documents: sent.map((doc) => doc.text),
    ...(req.topN !== undefined ? { topN: req.topN } : {}),
  };
  let response: CreateRerankResponse;
  try {
    response = await client.rerank.rerank({ requestBody }, req.signal !== undefined ? { signal: req.signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, errorPrefix(req.model));
  }
  if (typeof response === "string") {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `${errorPrefix(req.model)}: unexpected non-JSON rerank response`,
    });
  }
  const hits = response.results
    .map((result) => ({ id: sent[result.index]?.id, score: result.relevanceScore }))
    .filter((hit): hit is { id: string; score: number } => hit.id !== undefined)
    .sort((a, b) => b.score - a.score);
  return {
    hits,
    model: response.model,
    usage: { totalTokens: response.usage?.totalTokens ?? null },
  };
}
