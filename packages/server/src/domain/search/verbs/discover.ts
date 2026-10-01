// Host-scoped transcript search credits stored character evidence and retains uncredited passages.
import type { CorpusSource } from "@orb/contracts/search";
import type { CharacterId } from "@orb/kit/ids";
import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { DiscoverParams } from "../contract/params.ts";
import type { DiscoverResult, DiscoverSegment } from "../contract/results.ts";
import type { ActiveQuerySpace, SearchService } from "../contract/service.ts";
import { hostedChatIds, nearestSegments } from "../persistence/digest-rows.ts";
import { resolveChatDisplay, resolveSegmentDisplay } from "../persistence/display.ts";
import { readSourceAnchors } from "../persistence/source.ts";
import { DISCOVER_SEGMENT_POOL_CAP, DISCOVER_SEGMENT_POOL_FACTOR, DISCOVER_SEGMENTS_PER_CHAR, SNIPPET_CHARS } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf } from "../substrate/csls.ts";
import { collapseSegmentChunks } from "../substrate/dedupe.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { withActiveQuerySpace } from "../substrate/space.ts";
import { requirePositiveTopN } from "../substrate/top-n.ts";

interface DiscoverCandidate {
  readonly source: DiscoverSegment["source"];
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
  readonly relevance: number;
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
  titleByChat: ReadonlyMap<DiscoverSegment["chatId"], string | null>,
): void {
  const evidence: DiscoverSegment = {
    source: seg.source,
    chatId: seg.chatId,
    blockIdx: seg.blockIdx,
    snippet: seg.sourceText.slice(0, SNIPPET_CHARS),
    score: seg.score,
    relevance: relevanceOf(seg.distance),
    chatTitle: titleByChat.get(seg.chatId) ?? null,
  };
  for (const cr of credits) {
    const existing = byChar.get(cr.characterId);
    if (existing === undefined) {
      byChar.set(cr.characterId, {
        characterId: cr.characterId,
        score: seg.score,
        // The character's readout is its BEST segment's — the first credit is the best, the list being
        // ranked — so a group's number is the closeness of the moment that put it on the list.
        relevance: relevanceOf(seg.distance),
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
): Promise<DiscoverResult> {
  const [credits, chatDisplays] = await Promise.all([
    resolveSegmentDisplay(
      ctx.db,
      ownerId,
      ranked.map((c) => ({ chatId: c.chatId, blockIdx: c.blockIdx })),
    ),
    // The evidence groups are per CHAT, so they name the room (R1a) instead of a 6-char id slice.
    resolveChatDisplay(ctx.db, [...new Set(ranked.map((c) => c.chatId))]),
  ]);
  const titleByChat = new Map(chatDisplays.map((d) => [d.chatId, d.title]));
  const creditsBySlot = new Map<string, SegmentCredit[]>();
  for (const cr of credits) {
    const slot = blockSlot(cr.chatId, cr.blockIdx);
    creditsBySlot.set(slot, [...(creditsBySlot.get(slot) ?? []), cr]);
  }
  const byChar = new Map<CharacterId, CharacterGroup>();
  for (const seg of ranked) {
    creditSegment(byChar, seg, creditsBySlot.get(blockSlot(seg.chatId, seg.blockIdx)) ?? [], titleByChat);
  }
  const selectedCharacters = new Set<CharacterId>();
  const selectedSegments = new Set<DiscoverSegment["source"]["rowId"]>();
  for (const candidate of ranked) {
    const credit = creditsBySlot.get(blockSlot(candidate.chatId, candidate.blockIdx)) ?? [];
    if (credit.length === 0 && selectedCharacters.size + selectedSegments.size < topN) {
      selectedSegments.add(candidate.source.rowId);
    }
    for (const row of credit) {
      if (selectedCharacters.size + selectedSegments.size < topN) {
        selectedCharacters.add(row.characterId);
      }
    }
  }
  const anchors = new Map<CorpusSource["rowId"], Promise<Pick<CorpusSource, "seqStart" | "seqEnd" | "messageStartId" | "messageEndId">>>();
  const hits = await Promise.all(
    [...byChar.values()]
      .filter((group) => selectedCharacters.has(group.characterId))
      .map(async (group) => ({
        ...group,
        segments: await Promise.all(
          group.segments.map(async (segment) => ({
            ...segment,
            source: {
              ...segment.source,
              ...(await anchors.getOrInsertComputed(segment.source.rowId, async () =>
                readSourceAnchors(
                  ctx.db,
                  segment.source.chatId,
                  segment.source,
                  (await ctx.resolveViewerVisibility(segment.source.chatId, ownerId))?.historyFloorSeq ?? null,
                ),
              )),
            },
          })),
        ),
      })),
  );
  const standaloneSegments = await Promise.all(
    ranked
      .filter((candidate) => selectedSegments.has(candidate.source.rowId))
      .map(
        async (candidate): Promise<DiscoverSegment> => ({
          source: { ...candidate.source, ...(await readSourceAnchors(ctx.db, candidate.chatId, candidate.source)) },
          chatId: candidate.chatId,
          blockIdx: candidate.blockIdx,
          snippet: candidate.sourceText.slice(0, SNIPPET_CHARS),
          score: candidate.score,
          relevance: relevanceOf(candidate.distance),
          chatTitle: titleByChat.get(candidate.chatId) ?? null,
        }),
      ),
  );
  return { hits, standaloneSegments };
}

export function createDiscover(ctx: SearchContext): SearchService["discover"] {
  return async (params: DiscoverParams): Promise<DiscoverResult> => {
    const { ownerId, queryText, topN } = params;
    const rc = await ctx.roleClientsFor(ownerId);
    return await withActiveQuerySpace(ctx, ownerId, "embed", async (space) => {
      const queryVector = await embedDiscoverQuery(space.connection.embed, queryText, topN);
      const model = space.model;

      const chatIds = await hostedChatIds(ctx.db, ownerId);
      if (chatIds.length === 0) {
        return { hits: [], standaloneSegments: [] };
      }

      const poolK = Math.min(topN * DISCOVER_SEGMENT_POOL_FACTOR, DISCOVER_SEGMENT_POOL_CAP);
      const pool = await nearestSegments(ctx.db, { ownerId, queryVector, model, generationId: space.generationId, chatIds, limit: poolK });
      if (pool.length === 0) {
        return { hits: [], standaloneSegments: [] };
      }

      // RANK FIRST, COLLAPSE SECOND. Each block's chunk rows collapse to ONE (#172 — a block is N rows now):
      // evidence and `matchCount` are per SCENE, and counting two chunks of one block twice would inflate a
      // character's rank on the strength of one long message. But `collapseSegmentChunks` is FIRST-WINS over an
      // already-ranked list, so the order it is handed IS the choice of which chunk represents the block —
      // collapsing a raw-distance order threw away the chunk this verb actually ranks by, and a farther chunk
      // with the better hub adjustment lost its block to a closer, hubbier one. CSLS is the ranking; the
      // representative is the chunk that wins it.
      const sorted: DiscoverCandidate[] = collapseSegmentChunks(
        pool
          .map((s) => ({
            source: {
              kind: "segment" as const,
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
          ),
      );

      // Rerank segments before grouping so a promoted segment can pull in a low-CSLS character.
      const ranked = params.rerank === true ? await applyRerank(queryText, sorted, rc.rerank, sorted.length) : sorted;

      return await groupByCharacter(ctx, ownerId, ranked, topN);
    });
  };
}

async function embedDiscoverQuery(embed: ActiveQuerySpace["connection"]["embed"], queryText: string, topN: number): Promise<Float32Array> {
  if (queryText.trim().length === 0) {
    throw new SearchError(SEARCH_EMPTY_QUERY, "discover requires a queryText to embed + scan");
  }
  requirePositiveTopN(topN, "discover");
  const vector = (await embed(queryText, { inputType: "query" })).vectors[0];
  if (vector === null || vector === undefined) {
    throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
  }
  return vector;
}
