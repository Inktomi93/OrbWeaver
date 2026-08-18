// vLLM rerank surface: thin shaper over POST /v1/rerank; engine `index` = request order, mapped back
// to CALLER ids. Image sides use ScoreMultiModalParam with data URIs (engine needs no network).
//
// THE WINDOW GUARD IS CLIENT-SIDE (#173, the #165 pattern). This surface used to delegate truncation to the
// engine with `truncate_prompt_tokens: -1`; probed live against this box's rerank engine
// (Qwen3-VL-Reranker-2B, max_model_len 8192) that knob converts an over-window pair from a fast 400 into an
// UNBOUNDED HANG — an 8k-char document scores in 327ms, a 60k-char document WITH the param hangs >25s (120s
// in production), and the same document WITHOUT it is refused in 41ms. Any long rerank document was a 120s
// landmine, and the corpus really holds them (a 177k-char single message; a memory segment chunk is sized to
// the EMBED window, which equals the rerank window, so a full chunk + the query + the template overflows).
//
// So: clamp the text sides here (`@orb/kit/tokens.clampToTokenBudget`, the one home for the cut) and ask the
// engine for NOTHING.
//
// CLAMPING IS LEGITIMATE HERE, unlike on a memory embed (owner ruling, #165: "if we are skimping out on
// messages that's a no go since this feeds the memory system"). A rerank is a SCORING pass over candidates
// that already exist: nothing it reads is persisted, no vector claims a span it never read, and the full
// verbatim text stays in `chat_segments` either way. The cost of a clamp is a slightly less-informed score
// on a pathological document; the cost of the hang was a dead worker for two minutes. A clamp still LOGS —
// a scoring pass silently reading half its input is worth seeing.

import type { RerankDocument } from "@orb/contracts/role-clients";
import { clampToTokenBudget, estimateTokens } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { RerankHit, RerankRequest, RerankResult } from "../../contract/index.ts";
import type { VllmEngineClient } from "../engine/index.ts";
import { toDataUri } from "../engine/index.ts";

/** Tokens held back for the reranker's own yes/no template + the `<Instruct>` block wrapped around every
 *  (query, document) pair, plus slack for tokenizer disagreement on the clamp boundary. */
const RERANK_SCAFFOLD_RESERVE_TOKENS = 128;

/** Deps the rerank surface closes over. */
export interface VllmRerankDeps {
  readonly client: VllmEngineClient;
  /** The rerank engine's context window — the SAME value that launches it (`--max-model-len`), injected from
   *  `env.VLLM_RERANK_MAX_MODEL_LEN` in `createVllmBackend` so the clamp and the engine can't drift. */
  readonly maxInputTokens: number;
}

// The engine's /v1/rerank response (raw snake_case socket shape).
interface VllmRerankResponse {
  readonly model: string;
  readonly usage?: { readonly total_tokens?: number } | undefined;
  readonly results: ReadonlyArray<{ readonly index: number; readonly relevance_score: number }>;
}

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface ScoreParam {
  readonly content: ContentPart[];
}

// A document is scorable for this family if it carries text or an image.
function scorable(d: RerankDocument): boolean {
  return (d.text !== undefined && d.text.trim().length > 0) || d.image !== undefined;
}

// text/image/combo → ScoreMultiModalParam parts (image first, mirroring the cookbook).
async function toScoreParam(text: string | undefined, image: RerankDocument["image"]): Promise<ScoreParam> {
  const content: ContentPart[] = [];
  if (image !== undefined) {
    content.push({ type: "image_url", image_url: { url: await toDataUri(image) } });
  }
  if (text !== undefined && text.trim().length > 0) {
    content.push({ type: "text", text });
  }
  return { content };
}

/** Clamp ONE text side of the request to `budget` tokens, logging when the cut fires (see THE WINDOW GUARD).
 *  `side`/`index` name WHICH text was cut so a hot document is identifiable in the log. An IMAGE part cannot
 *  be measured client-side (its token cost is the vision encoder's), so an image-carrying pair keeps the fast
 *  400 as its backstop — that is the failure mode this surface can afford. */
function clampSide(text: string, budget: number, meta: { readonly model: string; readonly side: "query" | "document"; readonly index: number }): string {
  const clamped = clampToTokenBudget(text, budget);
  if (clamped.length !== text.length) {
    getLog().warn(
      {
        provider: true,
        backend: "vllm",
        event: "provider.rerank-clamped",
        model: meta.model,
        side: meta.side,
        index: meta.index,
        chars: text.length,
        clampedToChars: clamped.length,
        budget,
      },
      "vllm rerank: input exceeds the engine window — clamped to fit (the tail is not scored)",
    );
  }
  return clamped;
}

/** THE WINDOW GUARD's fold: the engine scores a (query, document) PAIR against ONE window, so the query is
 *  clamped first — to at most HALF the budget, so a pathological query can never crowd every document out of
 *  the pair — and each document then gets whatever the query left. `docTexts` is index-aligned to `docs`
 *  (`undefined` = an image-only document, which carries no text to cut). */
function clampToWindow(
  req: RerankRequest,
  docs: readonly RerankDocument[],
  maxInputTokens: number,
): { readonly queryText: string; readonly docTexts: readonly (string | undefined)[] } {
  const budget = maxInputTokens - RERANK_SCAFFOLD_RESERVE_TOKENS;
  const rawQueryText = typeof req.query === "string" ? req.query : (req.query.text ?? "");
  const queryText = clampSide(rawQueryText, Math.floor(budget / 2), { model: req.model, side: "query", index: 0 });
  const docBudget = budget - estimateTokens(queryText);
  const docTexts = docs.map((d, i) => (d.text === undefined ? undefined : clampSide(d.text, docBudget, { model: req.model, side: "document", index: i })));
  return { queryText, docTexts };
}

// Map the engine response → contract hits (request-order indexes → caller ids), sorted desc, sliced to topN.
function toRerankResult(response: VllmRerankResponse, documents: readonly RerankDocument[], topN: number | undefined, model: string): RerankResult {
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
export function createVllmRerank(deps: VllmRerankDeps): (req: RerankRequest) => Promise<RerankResult> {
  return async (req) => {
    const docs = req.documents.filter(scorable);
    if (docs.length === 0) {
      return { hits: [], model: req.model, usage: { totalTokens: null } };
    }

    const queryHasImage = typeof req.query !== "string" && req.query.image !== undefined;
    const multimodal = queryHasImage || docs.some((d) => d.image !== undefined);

    const { queryText, docTexts } = clampToWindow(req, docs, deps.maxInputTokens);

    let query: string | ScoreParam;
    let documents: string[] | ScoreParam[];
    if (multimodal) {
      query = typeof req.query === "string" ? queryText : await toScoreParam(req.query.text === undefined ? undefined : queryText, req.query.image);
      documents = await Promise.all(docs.map((d, i) => toScoreParam(docTexts[i], d.image)));
    } else {
      query = queryText;
      documents = docTexts.map((t) => t ?? "");
    }

    const body = {
      model: req.model,
      query,
      documents,
      // Per-task `<Instruct>` the reranker conditions its yes/no judgement on; omitted → the template default.
      ...(req.instruction !== undefined ? { instruction: req.instruction } : {}),
    };
    const response = await deps.client.enginePost<VllmRerankResponse>("rerank", "/v1/rerank", body, { signal: req.signal });
    return toRerankResult(response, docs, req.topN, req.model);
  };
}
