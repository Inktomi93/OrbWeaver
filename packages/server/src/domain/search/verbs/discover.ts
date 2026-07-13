// domain/search/verbs/discover — character discovery by best-segment neighbourhood. Pipeline: embed
// queryText → owner's materialized chat set → owner-wide cosine scan of chat_segments → CSLS hub-adjust
// → optional rerank of segments BEFORE grouping → credit each segment to its character(s) → group by
// character in ranked order, capped. Answers "who has lived scenes like X" (distinct from findCharacters'
// card match and corpus' block match). Rerank rejections propagate — search owns no fallback.

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

interface DiscoverCandidate {
  readonly id: string;
  readonly chatId: DiscoverSegment["chatId"];
  readonly blockIdx: number;
  readonly sourceText: string;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly score: number;
}

function blockSlot(chatId: DiscoverSegment["chatId"], blockIdx: number): string {
  return `${chatId}|${blockIdx}`;
}

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

type SegmentCredit = Awaited<ReturnType<typeof resolveSegmentDisplay>>[number];

/** A group scene credits each co-star: first appearance seeds the group, later ones bump matchCount +
 *  append evidence up to the per-character cap. Mutates byChar in ranked order. */
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

    // Rerank segments before grouping so a promoted segment can pull in a low-CSLS character.
    const ranked =
      params.rerank === true
        ? await applyRerank(queryText, sorted, ctx.roleClients.rerank, sorted.length)
        : sorted;

    return await groupByCharacter(ctx, ownerId, ranked, topN);
  };
}
