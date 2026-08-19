// domain/search/verbs/digests — within-chat digest retrieval; the ONLY search op memory.recall calls.
// Embed queryText → cosine scan chat_digests scoped to one authorized chat + embed space + optional
// candidates → CSLS hub-adjust rank → minScore floor (+ optional keywordMatch fold) → retrieveK top-K cut →
// optional rerank to rerankTo (mode mixC). No membership derivation: the caller already holds the authorized
// chat. retrieveK is the "top retrieveK" retrieval count (the cosine-ranked, floor-passing pool cut to its
// head — and the pool the mixC cross-encoder reranks); rerankTo is the mixC keep-count after that rerank.
// The embed + rerank carry the digests SCOPE_INSTRUCTIONS (#330 P3) — the SAME conditioning the corpus digest
// scan uses (`verbs/search.ts` digestScan); an instruction-aware family (Qwen3-VL) sharpens on it, a text-only
// one drops it (the no-op-knob doctrine), so the within-chat recall path is no longer the weaker sibling.
// FLAG[PD-35]: recencyBias is accepted on params but NOT applied here — its blend formula is undecided (#321).

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { DigestsParams } from "../contract/params.ts";
import type { DigestSearchHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestDigests } from "../persistence/digest-rows.ts";
import { SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf } from "../substrate/csls.ts";
import { blockKeyStr } from "../substrate/dedupe.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { applyRerank } from "../substrate/rerank.ts";

const MIN_TERM_LEN = 3;
const WORD_SPLIT = /[^a-z0-9]+/u;

function queryTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(WORD_SPLIT)
      .filter((t) => t.length >= MIN_TERM_LEN),
  );
}

function keywordHit(keywords: readonly string[], terms: ReadonlySet<string>): boolean {
  return keywords.some((k) => terms.has(k.toLowerCase()));
}

export function createDigests(ctx: SearchContext): SearchService["digests"] {
  return async (params: DigestsParams): Promise<DigestSearchHit[]> => {
    if (params.candidates !== undefined && params.candidates.length === 0) {
      return [];
    }
    const text = params.queryText;
    if (text === undefined || text.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "digests requires a queryText to embed + scan");
    }

    const embedded = await ctx.roleClients.embed(text, { inputType: "query", instruction: SCOPE_INSTRUCTIONS.digests.query });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    const pool = await nearestDigests(ctx.db, {
      queryVector,
      model: ctx.roleClients.embedModel,
      chatIds: [params.scope.chat],
      scopedCharacterId: params.scopedCharacterId,
      candidates: params.candidates,
      limit: params.candidates === undefined ? SCOPED_POOL_K : params.candidates.length,
    });

    const terms = params.keywordMatch ? queryTerms(text) : null;
    const ranked = pool
      .filter((r) => 1 - r.distance >= params.minScore || (terms !== null && keywordHit(r.keywords, terms)))
      .map((r) => {
        const blockKey = {
          chatId: r.chatId,
          tier: r.tier,
          blockIdx: r.blockIdx,
          scopedCharacterId: r.scopedCharacterId,
        };
        return {
          id: blockKeyStr(blockKey),
          blockKey,
          sourceText: r.text,
          distance: r.distance,
          hubScore: r.hubScore,
          score: cslsAdjust(r.distance, r.hubScore),
        };
      })
      .sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      );

    // The "top retrieveK" retrieval cut: keep the head of the CSLS-ranked, floor-passing pool. In mixC this is
    // the candidate pool the cross-encoder reranks, then rerankTo caps the reranked result.
    const retrieved = ranked.slice(0, params.retrieveK);
    // Instruction-aware rerankers key off the scope <Instruct> prefix; text-only families ignore it (the same
    // shape the corpus digest scan uses — #330 P3).
    const ordered =
      params.mode === "mixC"
        ? await applyRerank(`${SCOPE_INSTRUCTIONS.digests.rerank}\n${text}`, retrieved, ctx.roleClients.rerank, params.rerankTo)
        : retrieved;

    // `relevance` is the same `1 − distance` this verb's own minScore floor already compares against — one
    // definition of "how close is this", never a second.
    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, relevance: relevanceOf(c.distance), text: c.sourceText }));
  };
}
