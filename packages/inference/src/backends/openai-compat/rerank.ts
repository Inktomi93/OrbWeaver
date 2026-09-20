// The rerank task on the openai-compat wire — a plain `POST <baseUrl>/<features.rerankPath>` (the wire has no
// SDK rerank model): `{ model, query, documents, top_n?, instruction? }` → `{ results: [{ index,
// relevance_score }] }`, the shape vLLM's `/rerank` and OpenRouter's `/rerank` both answer. The engine's
// `index` is into the SENT slice, mapped back to the CALLER's stable ids. Multimodal sides (a query/document
// image) ride the ScoreMultiModalParam content array when the capability says `input ∋ image`.
//
// THE WINDOW GUARD IS CLIENT-SIDE (#173): the text sides are clamped to `capability.rerank.maxInputTokens`
// (query to at most half, each document to what the query left) and the engine is asked for NOTHING — the
// `truncate_prompt_tokens` knob turned an over-window pair from a fast 400 into an unbounded hang. A clamp is
// legitimate on a SCORING pass (nothing persisted) and is LOGGED.

import type { RerankHit, RerankResult } from "@orb/contracts/providers";
import type { RerankDocument, RerankQuery } from "@orb/contracts/role-clients";
import { clampToTokenBudget, estimateTokens } from "@orb/kit/tokens";
import { z } from "zod";
import { ProviderError } from "../../contract/errors.ts";
import type { RerankRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { authHeaders, fetchJson } from "../kit/fetch-json.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { toImageUrl } from "../v4/batch.ts";

const RERANK_SCAFFOLD_RESERVE_TOKENS = 128;
const TRAILING_SLASH_RE = /\/$/u;

export interface RerankDeps {
  readonly fetch: typeof fetch;
  readonly normalize: NormalizeImageBytes;
  readonly log: InferenceLog;
}

const rerankResponseSchema = z
  .object({
    results: z.array(z.object({ index: z.number(), relevance_score: z.number() }).loose()),
    usage: z.object({ total_tokens: z.number().optional() }).loose().optional(),
  })
  .loose();
type RerankResponse = z.infer<typeof rerankResponseSchema>;

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };
interface ScoreParam {
  readonly content: ContentPart[];
}

function scorable(doc: RerankDocument, multimodal: boolean): boolean {
  return (doc.text !== undefined && doc.text.trim().length > 0) || (multimodal && doc.image !== undefined);
}

async function toScoreParam(text: string | undefined, image: RerankDocument["image"], normalize: NormalizeImageBytes): Promise<ScoreParam> {
  const content: ContentPart[] = [];
  if (image !== undefined) {
    content.push({ type: "image_url", image_url: { url: await toImageUrl(image, normalize) } });
  }
  if (text !== undefined && text.trim().length > 0) {
    content.push({ type: "text", text });
  }
  return { content };
}

function queryTextOf(query: RerankQuery): string {
  return typeof query === "string" ? query : (query.text ?? "");
}

interface ClampedSides {
  readonly queryText: string;
  readonly docTexts: readonly (string | undefined)[];
}

interface ClampLog {
  readonly side: "query" | "document";
  readonly index: number;
  readonly chars: number;
  readonly clampedToChars: number;
  readonly budget: number;
}

function clampToWindow(req: RerankRequest, docs: readonly RerankDocument[], maxInputTokens: number, warn: (entry: ClampLog) => void): ClampedSides {
  const budget = maxInputTokens - RERANK_SCAFFOLD_RESERVE_TOKENS;
  const clampSide = (text: string, sideBudget: number, side: "query" | "document", index: number): string => {
    const clamped = clampToTokenBudget(text, sideBudget);
    if (clamped.length !== text.length) {
      warn({ side, index, chars: text.length, clampedToChars: clamped.length, budget: sideBudget });
    }
    return clamped;
  };
  const queryText = clampSide(queryTextOf(req.query), Math.floor(budget / 2), "query", 0);
  const docBudget = budget - estimateTokens(queryText);
  return { queryText, docTexts: docs.map((doc, i) => (doc.text === undefined ? undefined : clampSide(doc.text, docBudget, "document", i))) };
}

function toResult(response: RerankResponse, documents: readonly RerankDocument[], req: RerankRequest): RerankResult {
  const hits: RerankHit[] = response.results
    .flatMap((r) => {
      const doc = documents[r.index];
      return doc === undefined ? [] : [{ id: doc.id, score: r.relevance_score }];
    })
    .sort((a, b) => b.score - a.score);
  return {
    hits: req.topN === undefined ? hits : hits.slice(0, Math.max(0, req.topN)),
    model: req.connection.model,
    usage: { totalTokens: response.usage?.total_tokens ?? null },
  };
}

/** The wire sides: plain strings on a text-only pass, ScoreMultiModalParam arrays once any image rides. */
async function wireSides(
  req: RerankRequest,
  docs: readonly RerankDocument[],
  sides: ClampedSides,
  normalize: NormalizeImageBytes,
): Promise<{ readonly query: string | ScoreParam; readonly documents: string[] | ScoreParam[] }> {
  const queryHasImage = typeof req.query !== "string" && req.query.image !== undefined;
  const sendParts = queryHasImage || docs.some((doc) => doc.image !== undefined);
  if (!sendParts) {
    return { query: sides.queryText, documents: sides.docTexts.map((text) => text ?? "") };
  }
  const query = typeof req.query === "string" ? sides.queryText : await toScoreParam(sides.queryText, req.query.image, normalize);
  const documents = await Promise.all(docs.map((doc, i) => toScoreParam(sides.docTexts[i], doc.image, normalize)));
  return { query, documents };
}

export async function runOpenAiCompatRerank(req: RerankRequest, deps: RerankDeps): Promise<RerankResult> {
  const { connection } = req;
  const label = `${connection.providerId} rerank (${connection.model})`;
  const path = connection.features.rerankPath;
  if (path === undefined || connection.baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection's row declares no rerank path` });
  }
  if (connection.capability.kind !== "rerank") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the connection's model is a ${connection.capability.kind} model, not a reranker`,
    });
  }
  const capability = connection.capability.rerank;
  const multimodal = capability.input.includes("image");
  const docs = req.documents.filter((doc) => scorable(doc, multimodal));
  if (docs.length === 0) {
    return { hits: [], model: connection.model, usage: { totalTokens: null } };
  }
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const sides = clampToWindow(req, docs, capability.maxInputTokens, (entry) =>
    log.emit("warn", "provider.rerank-clamped", { model: connection.model, ...entry }),
  );
  if (sides.queryText.trim().length === 0 && !multimodal) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the query has no text and the model scores text only` });
  }
  const { query, documents } = await wireSides(req, docs, sides, deps.normalize);
  const result = await fetchJson({
    fetch: deps.fetch,
    url: `${connection.baseUrl.replace(TRAILING_SLASH_RE, "")}${path}`,
    method: "POST",
    headers: authHeaders(connection.credential.secret, connection.transport?.headers),
    body: {
      model: connection.model,
      query,
      documents,
      ...(req.topN !== undefined ? { top_n: req.topN } : {}),
      ...(req.instruction !== undefined && capability.instructionAware ? { instruction: req.instruction } : {}),
    },
    secrets: resolvedScrubSet(connection),
    label,
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
  });
  return toResult(rerankResponseSchema.parse(result.json), docs, req);
}
