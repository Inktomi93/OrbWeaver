// infra/providers/vllm/surfaces/rerank — the vLLM rerank role surface (Qwen3-VL-Reranker).
//
// A THIN shaper over the engine: POST /v1/rerank (Jina/Cohere-compatible). The engine returns
// results[{index, relevance_score}] where `index` is the REQUEST document order — we map back to CALLER
// ids (stable across reorderings). Registers against engine/ ONLY (the injected client + the shared image
// helper) — it imports no sibling surface.
//
// MODES (neo-grounded against the live engine): text-only (query + docs as plain strings) reproduces the
// card's reference ordering; any side carrying an image switches THAT side to vLLM's ScoreMultiModalParam
// `{ content: [parts] }` (one param = ONE document; a list = batched docs with request-order indexes). We
// always send data URIs (base64 ≡ URL, ≤ batch jitter) so the engine never needs network access.
//
// Long-doc truncation is delegated to the ENGINE (`truncate_prompt_tokens: -1`, `truncation_side: "right"`
// keeps query + doc-head, drops the doc tail where the relevance signal isn't) — vLLM 400s on an
// over-context pair otherwise, taking the whole call down.

import type { RerankDocument } from "@orb/contracts/role-clients";
import type { RerankHit, RerankRequest, RerankResult } from "../../contract";
import type { VllmEngineClient } from "../engine";
import { toDataUri } from "../engine";

// See header — engine-side, model-tokenizer truncation that auto-tracks --max-model-len.
const TRUNCATE_TO_MODEL_MAX = -1;
const TRUNCATION_SIDE_RIGHT = "right";

/** Deps the rerank surface closes over. */
export interface VllmRerankDeps {
  readonly client: VllmEngineClient;
}

// The engine's /v1/rerank response (raw snake_case socket shape).
interface VllmRerankResponse {
  readonly model: string;
  readonly usage?: { readonly total_tokens?: number } | undefined;
  readonly results: ReadonlyArray<{ readonly index: number; readonly relevance_score: number }>;
}

type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface ScoreParam {
  readonly content: ContentPart[];
}

// A document is scorable for this family if it carries text or an image.
function scorable(d: RerankDocument): boolean {
  return (d.text !== undefined && d.text.trim().length > 0) || d.image !== undefined;
}

// text/image/combo → ScoreMultiModalParam parts (image first, mirroring the cookbook).
async function toScoreParam(
  text: string | undefined,
  image: RerankDocument["image"],
): Promise<ScoreParam> {
  const content: ContentPart[] = [];
  if (image !== undefined) {
    content.push({ type: "image_url", image_url: { url: await toDataUri(image) } });
  }
  if (text !== undefined && text.trim().length > 0) {
    content.push({ type: "text", text });
  }
  return { content };
}

// Map the engine response → contract hits (request-order indexes → caller ids), sorted desc, sliced to topN.
function toRerankResult(
  response: VllmRerankResponse,
  documents: readonly RerankDocument[],
  topN: number | undefined,
  model: string,
): RerankResult {
  const hits: RerankHit[] = response.results
    .filter((r) => documents[r.index] !== undefined)
    .map((r) => ({ id: (documents[r.index] as RerankDocument).id, score: r.relevance_score }))
    .sort((a, b) => b.score - a.score);
  return {
    hits: topN === undefined ? hits : hits.slice(0, topN),
    model,
    usage: { totalTokens: response.usage?.total_tokens ?? null },
  };
}

/** Bind the rerank role to the engine client. */
export function createVllmRerank(
  deps: VllmRerankDeps,
): (req: RerankRequest) => Promise<RerankResult> {
  return async (req) => {
    const docs = req.documents.filter(scorable);
    if (docs.length === 0) {
      return { hits: [], model: req.model, usage: { totalTokens: null } };
    }

    const queryHasImage = typeof req.query !== "string" && req.query.image !== undefined;
    const multimodal = queryHasImage || docs.some((d) => d.image !== undefined);

    let query: string | ScoreParam;
    let documents: string[] | ScoreParam[];
    if (multimodal) {
      query =
        typeof req.query === "string"
          ? req.query
          : await toScoreParam(req.query.text, req.query.image);
      documents = await Promise.all(docs.map((d) => toScoreParam(d.text, d.image)));
    } else {
      query = typeof req.query === "string" ? req.query : (req.query.text ?? "");
      documents = docs.map((d) => d.text ?? "");
    }

    const body = {
      model: req.model,
      query,
      documents,
      // Per-task `<Instruct>` the reranker conditions its yes/no judgement on; omitted → the template default.
      ...(req.instruction !== undefined ? { instruction: req.instruction } : {}),
      truncate_prompt_tokens: TRUNCATE_TO_MODEL_MAX,
      truncation_side: TRUNCATION_SIDE_RIGHT,
    };
    const response = await deps.client.enginePost<VllmRerankResponse>(
      "rerank",
      "/v1/rerank",
      body,
      req.signal,
    );
    return toRerankResult(response, docs, req.topN, req.model);
  };
}
