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

import type { Task } from "@orb/contracts/inference";
import type { EmbedResult } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import { ProviderError } from "@orb/inference";
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
import { requireSpaceModel } from "../substrate/space.ts";

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

/** The two side roles this verb spends, spelled from the provider vocabulary (a typo is a tsc error) — the
 *  ROLE is what a failure here has to name, because it is the one thing the caller cannot infer. */
const EMBED_ROLE: Task = "embed";
const RERANK_ROLE: Task = "rerank";

/** OWN the query embed's failure (#1603) — the catch that holds a side-role generation is the only place that
 *  still knows WHICH role produced it.
 *
 *  Why it matters beyond a nicer message: a role client resolves its OWN credential per call, so this can be a
 *  401 on a key the CHAT connection has never seen. Escaping bare, it reached the turn as an anonymous failure
 *  — the engine's whole-body catch cannot say "your embed key was rejected" (and, since #1373 leg 3, correctly
 *  refuses to strike the chat credential for it), so the user was told the turn failed and never which of
 *  their keys to fix. The role name travels in the message, which is the surface a turn failure actually
 *  reaches a human through.
 *
 *  RETHROWN, never degraded: there is no query vector, so there is no retrieval — returning `[]` would report
 *  "nothing in this chat matches" for an outage, the exact silent lie the rerank arm below is careful not to
 *  tell (it degrades only because it already HOLDS a usable vector result). `rewrap` carries every
 *  classification + provenance field forward, so `kind`/`retryable`/`apiErrorStatus` still read true
 *  downstream. A non-provider failure (a db fault, a bug of ours) is NOT ours to re-frame and passes through
 *  untouched. */
async function embedQuery(rc: RoleClients, text: string): Promise<EmbedResult> {
  try {
    return await rc.embed(text, { inputType: "query", instruction: SCOPE_INSTRUCTIONS.digests.query });
  } catch (err) {
    if (!(err instanceof ProviderError)) {
      throw err;
    }
    getLog().warn({ ...err.toLog(), role: EMBED_ROLE }, "search: the embed role's provider call failed — digest recall cannot run without a query vector");
    throw err.rewrap(`the ${EMBED_ROLE} role's provider rejected this call (${err.kind}) — memory recall could not embed the query: ${err.message}`);
  }
}

/** mixC's local honest-degrade boundary. `applyRerank` itself stays strict for its other callers; only this
 * digest-recall path has a usable already-retrieved vector result to preserve. */
async function rerankOrKeep<T extends { readonly id: string; readonly sourceText: string | null }>(env: {
  readonly rc: RoleClients;
  readonly params: Pick<DigestsParams, "mode" | "rerankTo">;
  readonly text: string;
  readonly retrieved: T[];
  readonly events: DigestSearchEvents | undefined;
}): Promise<T[]> {
  const { rc, params, text, retrieved, events } = env;
  if (params.mode !== "mixC") {
    return retrieved;
  }
  try {
    return await applyRerank(`${SCOPE_INSTRUCTIONS.digests.rerank}\n${text}`, retrieved, rc.rerank, params.rerankTo);
  } catch (rerankErr) {
    // #405 F2: the CAUSE is logged before the degrade, matching both sibling degrade seams
    // (`compaction_failed` / `memory_build_failed` in chat's engine, which `getLog().warn({ err })` first).
    // `onRerankUnavailable()` carries no payload — it is a client-facing "you got mixB" bit — so without this
    // line an operator diagnosing a rerank outage had ZERO server-side signal: the fallback is honest to the
    // user and invisible to the person who has to fix it.
    // #1603 — the ROLE rides the line too, for the same reason the embed arm above names it: two different
    // side roles fail into this one verb, each with its own credential and its own provider.
    getLog().warn({ err: rerankErr, role: RERANK_ROLE }, "search: digest rerank unavailable — keeping the vector order (mixC → mixB)");
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

    const rc = await ctx.roleClientsFor(params.ownerId);
    const embedModel = await requireSpaceModel(ctx, params.ownerId, "embed");
    const embedded = await embedQuery(rc, text);
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    const pool = await nearestDigests(ctx.db, {
      queryVector,
      model: embedModel,
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
    const ordered = await rerankOrKeep({ rc, params, text, retrieved, events });

    // `relevance` is the same `1 − distance` this verb's own minScore floor already compares against — one
    // definition of "how close is this", never a second.
    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, relevance: relevanceOf(c.distance), text: c.sourceText }));
  };
}
