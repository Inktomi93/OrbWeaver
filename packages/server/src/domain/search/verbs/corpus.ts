// domain/search/verbs/corpus — cross-chat hybrid corpus retrieval ("where across all my chats did X
// happen"). Pipeline: embed queryText → owner-wide cosine scan of both lenses → minScore floor → CSLS
// hub-adjust → joint rerank across lenses (mode mixC) → block-level dedupe → content-hash collapse (after
// rank, before any k-cap). Owner-derived via characters.ownerId, never chats.ownerId/chat_participants.
// A segment forms a BlockKey only by matching a tier-0 digest of the same (chatId, blockIdx); unmatched
// verbatim is dropped. FLAG[PD-35]: a segment-only block (no digest yet) is not surfaced by corpus.

import type { BlockKey } from "@orb/contracts/search";
import type { SearchContext } from "../context";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { CorpusParams } from "../contract/params";
import type { CorpusHit } from "../contract/results";
import type { SearchService } from "../contract/service";
import { nearestDigests, nearestSegments } from "../persistence/digest-rows";
import { SCOPED_POOL_K } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";
import { blockKeyStr, collapseByContentHash, dedupeRankedBlocks } from "../substrate/dedupe";
import { applyRerank } from "../substrate/rerank";

interface CorpusCandidate {
  readonly id: string;
  readonly blockKey: BlockKey;
  readonly sourceText: string;
  readonly contentHash: string;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly score: number;
}

function blockSlot(chatId: BlockKey["chatId"], blockIdx: number): string {
  return `${chatId}|${blockIdx}`;
}

export function createCorpus(ctx: SearchContext): SearchService["corpus"] {
  return async (params: CorpusParams): Promise<CorpusHit[]> => {
    const text = params.queryText;
    if (text.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "corpus requires a queryText to embed + scan");
    }
    const embedded = await ctx.roleClients.embed(text, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
    }
    const model = ctx.roleClients.embedModel;

    const digestPool = (
      await nearestDigests(ctx.db, {
        queryVector,
        model,
        ownerId: params.ownerId,
        limit: SCOPED_POOL_K,
      })
    ).filter((r) => 1 - r.distance >= params.minScore);
    if (digestPool.length === 0) {
      return [];
    }

    const tier0ByBlock = new Map<string, BlockKey[]>();
    const digestCandidates = digestPool.map((d): CorpusCandidate => {
      const blockKey: BlockKey = {
        chatId: d.chatId,
        tier: d.tier,
        blockIdx: d.blockIdx,
        scopedCharacterId: d.scopedCharacterId,
      };
      if (d.tier === 0) {
        const slot = blockSlot(d.chatId, d.blockIdx);
        tier0ByBlock.set(slot, [...(tier0ByBlock.get(slot) ?? []), blockKey]);
      }
      return {
        id: `d|${blockKeyStr(blockKey)}`,
        blockKey,
        sourceText: d.text,
        contentHash: d.contentHash,
        distance: d.distance,
        hubScore: d.hubScore,
        score: cslsAdjust(d.distance, d.hubScore),
      };
    });

    const ownerChatIds = [...new Set(digestPool.map((d) => d.chatId))];
    const segmentPool = (
      await nearestSegments(ctx.db, {
        queryVector,
        model,
        chatIds: ownerChatIds,
        limit: SCOPED_POOL_K,
      })
    ).filter((r) => 1 - r.distance >= params.minScore);
    const segmentCandidates = segmentPool.flatMap((s): CorpusCandidate[] => {
      const matches = tier0ByBlock.get(blockSlot(s.chatId, s.blockIdx)) ?? [];
      const score = cslsAdjust(s.distance, s.hubScore);
      return matches.map((blockKey) => ({
        id: `s|${blockKeyStr(blockKey)}`,
        blockKey,
        sourceText: s.text,
        contentHash: s.contentHash,
        distance: s.distance,
        hubScore: s.hubScore,
        score,
      }));
    });

    const candidates = [...digestCandidates, ...segmentCandidates];
    const ranked =
      params.mode === "mixC"
        ? await applyRerank(text, candidates, ctx.roleClients.rerank, candidates.length)
        : [...candidates].sort(
            compareCslsBy(
              (c) => c.distance,
              (c) => c.hubScore,
            ),
          );

    const collapsed = collapseByContentHash(dedupeRankedBlocks(ranked));
    return collapsed.map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
  };
}
