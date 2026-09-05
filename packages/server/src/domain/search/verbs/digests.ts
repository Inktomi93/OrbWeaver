// domain/search/verbs/digests — within-chat digest retrieval; the ONLY search op memory.recall calls.
// Embed queryText → cosine scan chat_digests scoped to one authorized chat + embed space + optional
// candidates → CSLS hub-adjust rank → minScore floor (+ optional keywordMatch fold) → retrieveK top-K cut →
// optional rerank to rerankTo (mode mixC). No membership derivation: the caller already holds the authorized
// chat. retrieveK is the "top retrieveK" retrieval count (the cosine-ranked, floor-passing pool cut to its
// head — and the pool the mixC cross-encoder reranks); rerankTo is the mixC keep-count after that rerank.
// The embed + rerank carry the digests SCOPE_INSTRUCTIONS (#330 P3) — the SAME conditioning the corpus digest
// scan uses (`verbs/search.ts` digestScan); an instruction-aware family (Qwen3-VL) sharpens on it, a text-only
// one drops it (the no-op-knob doctrine), so the within-chat recall path is no longer the weaker sibling.
// NO RECENCY BOOST LIVES HERE (#321 / PD-35, owner ruling 2026-08-22). An experimental
// `relevance + recencyBias × recencyFactor` re-order shipped 2026-08-19 purely so the owner could MEASURE it;
// his 2026-08-20 probe over the real corpus (222-message conversation, biases 0…1) returned the same final
// top three at every bias in mixC and demonstrated HARM at a smaller retrieveK — a .626 semantic hit displaced
// by a newer .570 one. So the whole knob was removed rather than blessed with a production blend. Ranking here
// is CSLS relevance and nothing else; recall tuning returns as a fresh, separately-ruled feature or not at all.

import { getLog } from "#foundation/observability";
import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { DigestsParams } from "../contract/params.ts";
import type { DigestSearchHit } from "../contract/results.ts";
import type { DigestSearchEvents, SearchService } from "../contract/service.ts";
import { nearestDigests } from "../persistence/digest-rows.ts";
import { SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf } from "../substrate/csls.ts";
import { blockKeyStr } from "../substrate/dedupe.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { applyRerank } from "../substrate/rerank.ts";

const MIN_TERM_LEN = 3;
// SPLIT ON "NOT A LETTER OR DIGIT", NOT ON "NOT ASCII". `[^a-z0-9]+` treated every Cyrillic, Greek, CJK and
// accented character as a SEPARATOR, so a query in one of those scripts split into empty strings and the
// keyword fallback this verb documents could never fire for it — the whole population, not an edge case.
// `\p{L}\p{N}` needs the `u` flag (that is what makes the property escapes legal here).
const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

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

/** mixC's local honest-degrade boundary. `applyRerank` itself stays strict for its other callers; only this
 * digest-recall path has a usable already-retrieved vector result to preserve. */
async function rerankOrKeep<T extends { readonly id: string; readonly sourceText: string | null }>(env: {
  readonly ctx: SearchContext;
  readonly params: Pick<DigestsParams, "mode" | "rerankTo">;
  readonly text: string;
  readonly retrieved: T[];
  readonly events: DigestSearchEvents | undefined;
}): Promise<T[]> {
  const { ctx, params, text, retrieved, events } = env;
  if (params.mode !== "mixC") {
    return retrieved;
  }
  try {
    return await applyRerank(`${SCOPE_INSTRUCTIONS.digests.rerank}\n${text}`, retrieved, ctx.roleClients.rerank, params.rerankTo);
  } catch (rerankErr) {
    // #405 F2: the CAUSE is logged before the degrade, matching both sibling degrade seams
    // (`compaction_failed` / `memory_build_failed` in chat's engine, which `getLog().warn({ err })` first).
    // `onRerankUnavailable()` carries no payload — it is a client-facing "you got mixB" bit — so without this
    // line an operator diagnosing a rerank outage had ZERO server-side signal: the fallback is honest to the
    // user and invisible to the person who has to fix it.
    getLog().warn({ err: rerankErr }, "search: digest rerank unavailable — keeping the vector order (mixC → mixB)");
    events?.onRerankUnavailable();
    return retrieved;
  }
}

export function createDigests(ctx: SearchContext): SearchService["digests"] {
  return async (params: DigestsParams, events?: DigestSearchEvents): Promise<DigestSearchHit[]> => {
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

    // The "top retrieveK" retrieval cut: keep the head of the ranked, floor-passing pool. In mixC this is
    // the candidate pool the cross-encoder reranks, then rerankTo caps the reranked result.
    const retrieved = ranked.slice(0, params.retrieveK);
    // Instruction-aware rerankers key off the scope <Instruct> prefix; text-only families ignore it (the same
    // shape the corpus digest scan uses — #330 P3).
    // Retrieval already completed successfully. A failed rerank keeps that exact vector/CSLS order intact
    // and lets the caller surface the narrower outage through its own user-facing channel.
    const ordered = await rerankOrKeep({ ctx, params, text, retrieved, events });

    // `relevance` is the same `1 − distance` this verb's own minScore floor already compares against — one
    // definition of "how close is this", never a second.
    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, relevance: relevanceOf(c.distance), text: c.sourceText }));
  };
}
