// domain/search/verbs/digests — within-chat DIGEST retrieval (knowledge-cluster §6 within-chat; the ONLY
// search op `memory.recall` calls, for mixB/mixC). Embed `queryText` → cosine scan `chat_digests` scoped to
// the ONE authorized chat (`scope.chat`) + the embed SPACE (`model`) + the egocentric bucket / tiered-bridge
// `candidates` → CSLS hub-adjust rank → `minScore` floor (+ optional `keywordMatch` fold) → optional
// cross-encoder rerank (mode `mixC`). Returns ranked {@link DigestSearchHit}s, each carrying its `BlockKey`
// (the compose root maps hits → `BlockKey[]` for `ChatContext.searchDigests`; memory resolves keys → text).
//
// No membership derivation: the caller already holds the authorized chat (recall runs host-only under
// `runAsUserId`). Owner-scope is therefore the chat belt itself — search does NOT read `users`/`chats`.
//
// FLAG[PD-35]: `recencyBias` + `verbatimWindow` are accepted on the params but NOT applied here —
// `verbatimWindow` is memory's PRE-call query-assembly knob (it shapes `queryText`, not the scan); a precise
// `recencyBias` blend formula is undecided (the neo respell carried `owner_id`/cv we reject — build fresh,
// not port). `minScore` + `keywordMatch` + `candidates` + `mode` rerank are applied.

import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { DigestsParams } from "../contract/params";
import type { DigestSearchHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestDigests } from "../persistence/digest-rows";
import { SCOPED_POOL_K } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";
import { blockKeyStr } from "../substrate/dedupe";
import { applyRerank } from "../substrate/rerank";

/** The distinctive-term minimum length for the `keywordMatch` fold (drop stop-word-length noise). */
const MIN_TERM_LEN = 3;
/** Non-alphanumeric run = the query tokenizer split (top-level — reused per call). */
const WORD_SPLIT = /[^a-z0-9]+/u;

/** Tokenize a query into distinctive lowercased word terms (≥ {@link MIN_TERM_LEN} chars). */
function queryTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(WORD_SPLIT)
      .filter((t) => t.length >= MIN_TERM_LEN),
  );
}

/** Whether any of the digest's distinctive `keywords` overlaps the query terms (the lexical recall anchor). */
function keywordHit(keywords: readonly string[], terms: ReadonlySet<string>): boolean {
  return keywords.some((k) => terms.has(k.toLowerCase()));
}

export function createDigests(ctx: SearchContext): SearchService["digests"] {
  return async (params: DigestsParams): Promise<DigestSearchHit[]> => {
    // An empty tiered-bridge ⇒ nothing to score; never scan the full pool by mistake.
    if (params.candidates !== undefined && params.candidates.length === 0) {
      return [];
    }
    const text = params.queryText;
    if (text === undefined || text.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "digests requires a queryText to embed + scan");
    }

    const embedded = await ctx.roleClients.embed(text, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
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
      .filter(
        (r) =>
          1 - r.distance >= params.minScore || (terms !== null && keywordHit(r.keywords, terms)),
      )
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

    const ordered =
      params.mode === "mixC"
        ? await applyRerank(text, ranked, ctx.roleClients.rerank, ranked.length)
        : ranked;

    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
  };
}
