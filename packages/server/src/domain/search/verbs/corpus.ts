// domain/search/verbs/corpus — cross-chat HYBRID corpus retrieval (knowledge-cluster §6 cross-chat: "where
// across all my chats did X happen"). The full pipeline: embed `queryText` → owner-wide cosine scan of BOTH
// lenses (`chat_digests` owner-belted via the producer card + `chat_segments` over the owner's materialized
// chat set) → `minScore` floor → CSLS hub-adjust → JOINT cross-encoder rerank across both lenses (mode
// `mixC`) → block-level dedupe (a digest + its segment of the same block collapse to the better-ranked lens)
// → content-hash collapse (fork/import copies → one representative, AFTER rank, BEFORE any k-cap; inv 6).
//
// OWNER-DERIVED, NOT membership-read (knowledge-cluster §6 full-membership model, not "host-only v1"):
// the digest owner belt is `characters.ownerId` via the `scopedCharacterId` producer card (D20) — NO
// `chats.ownerId` (D18), NO `chat_participants` (membership is materialized at BUILD by the witnessing
// horizons; the read-time gate is the owned bucket). The verbatim lens has no character column, so its chat
// scope is the owner's MATERIALIZED chat set — the distinct chats of the owner's digest hits.
//
// SEGMENT KEYING: a segment forms a `BlockKey` only by matching a tier-0 digest of the SAME `(chatId,
// blockIdx)` (it inherits that digest's `scopedCharacterId` — inv 8 real id, no `''` sentinel). A segment
// with no matching digest is DROPPED (it cannot key, and a keyless verbatim block is useless to the
// consumer). FLAG[PD-35]: a segment-only block (no digest yet) is therefore not surfaced by corpus.

import type { BlockKey } from "@orb/contracts/search";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { CorpusParams } from "../contract/params";
import type { CorpusHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
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
  /** The raw cosine distance (the compareCsls tie-break key — the clamp flattens `cos ≥ hub` to 0). */
  readonly distance: number;
  readonly hubScore: number | null;
  readonly score: number;
}

/** The `(chatId, blockIdx)` slot key — the cross-lens join between a segment and its tier-0 digest(s). */
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

    // Digest candidates + the tier-0 `(chatId, blockIdx)` → block-keys map a segment joins on.
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

    // Segment candidates, each keyed by its matching tier-0 digest block(s); unmatched verbatim is dropped.
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

    // Collapse AFTER ranking (inv 6): block-level (digest+segment of one block) then content-hash (copies).
    const collapsed = collapseByContentHash(dedupeRankedBlocks(ranked));
    return collapsed.map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
  };
}
