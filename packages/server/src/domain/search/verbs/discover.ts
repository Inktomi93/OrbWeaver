// domain/search/verbs/discover — character discovery by best-segment neighbourhood (PD-35, the THIRD
// retrieval lens). The pipeline: embed `queryText` → the owner's MATERIALIZED chat set (derived from the
// owner's tier-0 digests — the verbatim lens has no owner column, D20) → owner-wide cosine scan of
// `chat_segments` (the LIVED-SCENE space) → CSLS hub-adjust → optional cross-encoder rerank of the SEGMENTS
// BEFORE grouping → credit each segment to its character(s) via `resolveSegmentDisplay` (the tier-0 digest
// join; a GROUP block credits every co-star) → group by character in ranked order (first appearance = best
// segment) → cap `DISCOVER_SEGMENTS_PER_CHAR` evidence/char + slice `topN` characters.
//
// Distinct from `findCharacters` ("whose CARD reads like X") and `corpus` ("which BLOCKS match, keyed for
// memory"): `discover` answers "WHO has lived scenes like X — with the scenes as evidence". The query is
// embedded `inputType: "query"` only (the house pattern — no `SCOPE_INSTRUCTIONS`; nothing built consumes
// per-scope instruction strings). Rerank rejections PROPAGATE (PD-11 — search owns no fallback).

import type { CharacterId } from "@orb/kit/ids";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { DiscoverParams } from "../contract/params";
import type { DiscoverCharacter, DiscoverSegment } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestSegments, ownedChatIds } from "../persistence/digest-rows";
import { resolveSegmentDisplay } from "../persistence/display";
import {
  DISCOVER_SEGMENT_POOL_CAP,
  DISCOVER_SEGMENT_POOL_FACTOR,
  DISCOVER_SEGMENTS_PER_CHAR,
  SNIPPET_CHARS,
} from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";
import { applyRerank } from "../substrate/rerank";

/** One ranked verbatim-segment candidate (rerankable by `id`/`sourceText`; carries the CSLS `score`). */
interface DiscoverCandidate {
  readonly id: string;
  readonly chatId: DiscoverSegment["chatId"];
  readonly blockIdx: number;
  readonly sourceText: string;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly score: number;
}

/** The `(chatId, blockIdx)` slot key — the join between a ranked segment and its credited characters. */
function blockSlot(chatId: DiscoverSegment["chatId"], blockIdx: number): string {
  return `${chatId}|${blockIdx}`;
}

/** Mutable grouping accumulator (the result fields are readonly; we build then freeze into a `DiscoverCharacter`). */
interface CharacterGroup {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
  matchCount: number;
  readonly segments: DiscoverSegment[];
}

/** One segment→character credit (the `resolveSegmentDisplay` row shape, by inference). */
type SegmentCredit = Awaited<ReturnType<typeof resolveSegmentDisplay>>[number];

/** Fold ONE ranked segment's evidence into every character it credits (a group scene credits each co-star:
 *  first appearance seeds the group at that segment's score; later ones bump `matchCount` + append evidence
 *  up to the per-character cap). Mutates `byChar` in ranked order (insertion order = character rank). */
function creditSegment(
  byChar: Map<CharacterId, CharacterGroup>,
  seg: DiscoverCandidate,
  credits: readonly SegmentCredit[],
): void {
  const evidence: DiscoverSegment = {
    chatId: seg.chatId,
    blockIdx: seg.blockIdx,
    snippet: seg.sourceText.slice(0, SNIPPET_CHARS),
    score: seg.score,
  };
  for (const cr of credits) {
    const existing = byChar.get(cr.characterId);
    if (existing === undefined) {
      byChar.set(cr.characterId, {
        characterId: cr.characterId,
        score: seg.score,
        name: cr.name,
        avatarHash: cr.avatarHash,
        genre: cr.genre,
        tone: cr.tone,
        elevatorPitch: cr.elevatorPitch,
        matchCount: 1,
        segments: [evidence],
      });
    } else {
      existing.matchCount += 1;
      if (existing.segments.length < DISCOVER_SEGMENTS_PER_CHAR) {
        existing.segments.push(evidence);
      }
    }
  }
}

/** Credit every ranked segment (co-star aware) then group by character in ranked order, capped to `topN`. */
async function groupByCharacter(
  ctx: SearchContext,
  ownerId: DiscoverParams["ownerId"],
  ranked: readonly DiscoverCandidate[],
  topN: number,
): Promise<DiscoverCharacter[]> {
  const credits = await resolveSegmentDisplay(
    ctx.db,
    ownerId,
    ranked.map((c) => ({ chatId: c.chatId, blockIdx: c.blockIdx })),
  );
  const creditsBySlot = new Map<string, SegmentCredit[]>();
  for (const cr of credits) {
    const slot = blockSlot(cr.chatId, cr.blockIdx);
    creditsBySlot.set(slot, [...(creditsBySlot.get(slot) ?? []), cr]);
  }
  // The Map preserves insertion order, so first appearance = best segment → characters emerge ranked.
  const byChar = new Map<CharacterId, CharacterGroup>();
  for (const seg of ranked) {
    creditSegment(byChar, seg, creditsBySlot.get(blockSlot(seg.chatId, seg.blockIdx)) ?? []);
  }
  return [...byChar.values()].slice(0, topN);
}

export function createDiscover(ctx: SearchContext): SearchService["discover"] {
  return async (params: DiscoverParams): Promise<DiscoverCharacter[]> => {
    const { ownerId, queryText, topN } = params;
    if (queryText.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "discover requires a queryText to embed + scan");
    }
    const embedded = await ctx.roleClients.embed(queryText, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
    }
    const model = ctx.roleClients.embedModel;

    // The owner's materialized chat set bounds the ownerless verbatim scan (D20 derive via digests).
    const chatIds = await ownedChatIds(ctx.db, ownerId, model);
    if (chatIds.length === 0) {
      return [];
    }

    const poolK = Math.min(topN * DISCOVER_SEGMENT_POOL_FACTOR, DISCOVER_SEGMENT_POOL_CAP);
    const pool = await nearestSegments(ctx.db, { queryVector, model, chatIds, limit: poolK });
    if (pool.length === 0) {
      return [];
    }

    const sorted: DiscoverCandidate[] = pool
      .map((s) => ({
        id: blockSlot(s.chatId, s.blockIdx),
        chatId: s.chatId,
        blockIdx: s.blockIdx,
        sourceText: s.text,
        distance: s.distance,
        hubScore: s.hubScore,
        score: cslsAdjust(s.distance, s.hubScore),
      }))
      .sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      );

    // Rerank the SEGMENTS before grouping (a promoted segment can pull in a low-CSLS character). The whole
    // pool is reranked (topN = the pool size) so grouping still yields enough distinct characters.
    const ranked =
      params.rerank === true
        ? await applyRerank(queryText, sorted, ctx.roleClients.rerank, sorted.length)
        : sorted;

    return await groupByCharacter(ctx, ownerId, ranked, topN);
  };
}
