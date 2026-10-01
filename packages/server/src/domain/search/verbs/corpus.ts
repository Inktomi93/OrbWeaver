// Joint host-scoped digest and transcript retrieval preserves genuine source identity (D16/D20).
import type { BlockKey, CorpusSource } from "@orb/contracts/search";
import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { CorpusParams } from "../contract/params.ts";
import type { CorpusHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { hostedChatIds, nearestDigests, nearestSegments, segmentBlockKeys } from "../persistence/digest-rows.ts";
import { resolveChatDisplay } from "../persistence/display.ts";
import { readSourceAnchors } from "../persistence/source.ts";
import { SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust } from "../substrate/csls.ts";
import { blockKeyStr, collapseByContentHash } from "../substrate/dedupe.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { withActiveQuerySpace } from "../substrate/space.ts";
import { createDigestSourceCoverage } from "./digest-sources.ts";

interface CorpusCandidate {
  readonly id: string;
  readonly blockKeys: readonly BlockKey[];
  readonly source: CorpusSource;
  readonly slot: string;
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
  const coverage = createDigestSourceCoverage(ctx);
  return async (params: CorpusParams): Promise<CorpusHit[]> => {
    const text = params.queryText;
    const rc = await ctx.roleClientsFor(params.ownerId);
    return await withActiveQuerySpace(ctx, params.ownerId, "embed", async (space) => {
      if (text.trim().length === 0) {
        throw new SearchError(SEARCH_EMPTY_QUERY, "corpus requires a queryText to embed + scan");
      }
      const embedded = await space.connection.embed(text, { inputType: "query" });
      const queryVector = embedded.vectors[0];
      if (queryVector === null || queryVector === undefined) {
        throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
      }
      const model = space.model;

      const digestPool = (
        await nearestDigests(ctx.db, {
          queryVector,
          model,
          generationId: space.generationId,
          ownerId: params.ownerId,
          limit: SCOPED_POOL_K,
        })
      ).filter((r) => 1 - r.distance >= params.minScore);
      const digestCandidates = digestPool.map((d): CorpusCandidate => {
        const blockKey: BlockKey = { chatId: d.chatId, tier: d.tier, blockIdx: d.blockIdx, scopedCharacterId: d.scopedCharacterId };
        return {
          id: `d|${blockKeyStr(blockKey)}`,
          blockKeys: [blockKey],
          slot: blockKeyStr(blockKey),
          source: {
            kind: "digest",
            rowId: d.rowId,
            generationId: d.generationId,
            fingerprint: d.fingerprint,
            contentHash: d.contentHash,
            ...blockKey,
            seqStart: null,
            seqEnd: null,
            messageStartId: null,
            messageEndId: null,
          },
          sourceText: d.text,
          contentHash: d.contentHash,
          distance: d.distance,
          hubScore: d.hubScore,
          score: cslsAdjust(d.distance, d.hubScore),
        };
      });

      const chatIds = await hostedChatIds(ctx.db, params.ownerId);
      const segmentPool = (
        await nearestSegments(ctx.db, { queryVector, model, generationId: space.generationId, ownerId: params.ownerId, chatIds, limit: SCOPED_POOL_K })
      ).filter((row) => 1 - row.distance >= params.minScore);
      const tier0ByBlock = new Map<string, BlockKey[]>();
      for (const key of await segmentBlockKeys(ctx.db, { ownerId: params.ownerId, model, generationId: space.generationId, segments: segmentPool })) {
        const slot = blockSlot(key.chatId, key.blockIdx);
        tier0ByBlock.set(slot, [...(tier0ByBlock.get(slot) ?? []), key]);
      }
      const segmentCandidates = segmentPool.map(
        (s): CorpusCandidate => ({
          id: `s|${s.rowId}`,
          blockKeys: tier0ByBlock.get(blockSlot(s.chatId, s.blockIdx)) ?? [],
          slot: blockSlot(s.chatId, s.blockIdx),
          source: {
            kind: "segment",
            rowId: s.rowId,
            generationId: s.generationId,
            fingerprint: s.fingerprint,
            contentHash: s.contentHash,
            chatId: s.chatId,
            blockIdx: s.blockIdx,
            chunkIdx: s.chunkIdx,
            seqStart: s.seqStart,
            seqEnd: s.seqEnd,
            messageStartId: null,
            messageEndId: null,
          },
          sourceText: s.text,
          contentHash: s.contentHash,
          distance: s.distance,
          hubScore: s.hubScore,
          score: cslsAdjust(s.distance, s.hubScore),
        }),
      );

      const candidates = [...digestCandidates, ...segmentCandidates];
      const ranked =
        params.mode === "mixC"
          ? await applyRerank(text, candidates, rc.rerank, candidates.length)
          : candidates.toSorted(
              compareCslsBy(
                (c) => c.distance,
                (c) => c.hubScore,
              ),
            );

      const seen = new Set<string>();
      const deduped = ranked.flatMap((candidate): CorpusCandidate[] => {
        const keys = candidate.blockKeys.map(blockKeyStr);
        if (keys.length === 0) {
          keys.push(candidate.slot);
        }
        if (keys.every((key) => seen.has(key))) {
          return [];
        }
        const blockKeys = candidate.blockKeys.filter((key) => !seen.has(blockKeyStr(key)));
        for (const key of keys) {
          seen.add(key);
        }
        return [{ ...candidate, blockKeys }];
      });
      const collapsed = collapseByContentHash(deduped);
      const titles = new Map(
        (await resolveChatDisplay(ctx.db, [...new Set(collapsed.map((candidate) => candidate.source.chatId))])).map((row) => [row.chatId, row.title]),
      );
      return await Promise.all(
        collapsed.map(async (candidate) => ({
          source: {
            ...candidate.source,
            ...(candidate.source.kind === "digest"
              ? await coverage(candidate.source, 0)
              : await readSourceAnchors(ctx.db, candidate.source.chatId, candidate.source)),
          },
          blockKeys: candidate.blockKeys,
          score: candidate.score,
          relevance: 1 - candidate.distance,
          text: candidate.sourceText,
          chatTitle: titles.get(candidate.source.chatId) ?? null,
        })),
      );
    });
  };
}
