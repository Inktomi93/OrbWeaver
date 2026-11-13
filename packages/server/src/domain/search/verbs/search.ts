// Unified search dispatch preserves each producer category's scope.
// Room-derived scans require current host membership in SQL before ranking (D16/D20).
// Character-card and image scans retain their producer ownership rules.
// Every scan here is the caller's own, on the caller's own encoder; no target runs on another account's index.

import type { MemoryRetrievalMode, SearchScope } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { blockKeyStr } from "@orb/kit/recall";
import { applyRerank } from "@orb/kit/rerank";
import { SEARCH_EMPTY_QUERY, SEARCH_LENS_REQUIRED, SEARCH_SCOPE_UNSUPPORTED, SearchError } from "../contract/errors.ts";
import type { UnifiedSearchParams } from "../contract/params.ts";
import type { DigestSourceHit, UnifiedSearchResult, UnifiedSearchRows } from "../contract/results.ts";
import type { DigestCoverageOp, SearchContext, SearchService } from "../contract/service.ts";
import { nearestDigests } from "../persistence/digest-rows.ts";
import { resolveCharacterDisplay, resolveChatDisplay } from "../persistence/display.ts";
import { DISCOVER_SEGMENT_POOL_CAP, DISCOVER_SEGMENT_POOL_FACTOR, DISCOVER_SEGMENTS_PER_CHAR, OWNER_OVERFETCH, SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf } from "../substrate/csls.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { withActiveQuerySpace } from "../substrate/space.ts";

/** Delegated retrieval retains producer scope; digest scopes share the current-host scan below. */
type DelegateVerbs = Pick<SearchService, "knn" | "findCharacters" | "discover" | "corpus" | "images" | "documents">;

function assertNever(value: never): never {
  throw new SearchError(SEARCH_SCOPE_UNSUPPORTED, `unhandled search dispatch: ${String(value)}`);
}

/** rerank ⇒ mixC (cross-encoder), else mixB (vector retrieve). */
function memoryMode(rerank: boolean | undefined): MemoryRetrievalMode {
  return rerank === true ? "mixC" : "mixB";
}

/** Owner-wide targets refuse a narrower scope rather than silently ignore it (flag-don't-fake). */
function requireOwnerScope(scope: SearchScope, over: string): void {
  if (scope.kind !== "owner") {
    throw new SearchError(SEARCH_SCOPE_UNSUPPORTED, `the ${over} target is owner-wide — it cannot honor a ${scope.kind} scope`);
  }
}

function digestScopeFilter(scope: SearchScope): { readonly chatIds?: readonly ChatId[] } | { readonly speakerCharacterId: CharacterId } {
  switch (scope.kind) {
    case "chat":
      return { chatIds: [scope.chatId] };
    case "character":
      return { speakerCharacterId: scope.characterId };
    case "owner":
      return {};
    default:
      return assertNever(scope);
  }
}

/** Every digest scope requires current host membership before ranking; chat and character filters only narrow that pool. */
async function digestScan(ctx: SearchContext, args: UnifiedSearchParams, coverage: DigestCoverageOp): Promise<DigestSourceHit[]> {
  const rc = await ctx.roleClientsFor(args.ownerId);
  return await withActiveQuerySpace(ctx, args.ownerId, "embed", async (space) => {
    const embedded = await space.connection.embed(args.query, {
      inputType: "query",
      instruction: SCOPE_INSTRUCTIONS.digests.query,
    });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }
    const pool = await nearestDigests(ctx.db, {
      queryVector,
      model: space.model,
      generationId: space.generationId,
      ownerId: args.ownerId,
      ...digestScopeFilter(args.scope),
      limit: Math.min(args.topN * OWNER_OVERFETCH, SCOPED_POOL_K),
    });
    const ranked = pool
      .map((r) => {
        const blockKey = {
          chatId: r.chatId,
          tier: r.tier,
          blockIdx: r.blockIdx,
          scopedCharacterId: r.scopedCharacterId,
        };
        return {
          row: r,
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
    // Instruction-aware rerankers key off the scope <Instruct>; text-only families ignore the prefix.
    const ordered = args.rerank === true ? await applyRerank(`${SCOPE_INSTRUCTIONS.digests.rerank}\n${args.query}`, ranked, rc.rerank, ranked.length) : ranked;
    const top = ordered.slice(0, args.topN);
    // The DESTINATION vocabulary (R1a), resolved for the SURVIVORS only — the same rank-then-enrich shape
    // discover uses, so an 80-row pool never pays for 60 display joins it throws away.
    const [chatDisplays, characterDisplays] = await Promise.all([
      resolveChatDisplay(ctx.db, [...new Set(top.map((c) => c.blockKey.chatId))]),
      resolveCharacterDisplay(ctx.db, args.ownerId, [...new Set(top.map((c) => c.blockKey.scopedCharacterId))]),
    ]);
    const titleByChat = new Map(chatDisplays.map((d) => [d.chatId, d.title]));
    const nameByCharacter = new Map(characterDisplays.map((d) => [d.characterId, d.name]));
    const visibilityByChat = new Map<ChatId, Promise<Awaited<ReturnType<SearchContext["resolveViewerVisibility"]>>>>();
    return await Promise.all(
      top.map(async (c) => ({
        source: {
          kind: "digest" as const,
          rowId: c.row.rowId,
          generationId: c.row.generationId,
          fingerprint: c.row.fingerprint,
          contentHash: c.row.contentHash,
          ...c.blockKey,
          ...(await coverage(
            { ...c.blockKey, generationId: c.row.generationId, contentHash: c.row.contentHash },
            (
              await visibilityByChat.getOrInsertComputed(c.blockKey.chatId, () => ctx.resolveViewerVisibility(c.blockKey.chatId, args.ownerId))
            )?.historyFloorSeq ?? null,
          )),
        },
        blockKey: c.blockKey,
        score: c.score,
        relevance: relevanceOf(c.distance),
        text: c.sourceText,
        chatTitle: titleByChat.get(c.blockKey.chatId) ?? null,
        scopedCharacterName: nameByCharacter.get(c.blockKey.scopedCharacterId) ?? null,
      })),
    );
  });
}

export function createSearch(ctx: SearchContext, verbs: DelegateVerbs, coverage: DigestCoverageOp): SearchService["search"] {
  const run = async (params: UnifiedSearchParams): Promise<UnifiedSearchRows> => {
    const { ownerId, query, topN, over, scope, rerank } = params;
    if (query.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "search requires a query to embed + scan");
    }

    switch (over) {
      case "entities":
        requireOwnerScope(scope, over);
        return { over, hits: await verbs.knn({ ownerId, query, topN, rerank }) };
      case "characters":
        requireOwnerScope(scope, over);
        return { over, hits: await verbs.findCharacters({ ownerId, query, topN, rerank }) };
      case "discover":
        requireOwnerScope(scope, over);
        return { over, ...(await verbs.discover({ ownerId, queryText: query, topN, rerank })) };
      case "corpus":
        requireOwnerScope(scope, over);
        return {
          over,
          hits: (
            await verbs.corpus({
              ownerId,
              queryText: query,
              mode: memoryMode(rerank),
              minScore: 0,
            })
          ).slice(0, topN),
        };
      case "images": {
        requireOwnerScope(scope, over);
        if (params.lens === undefined) {
          throw new SearchError(SEARCH_LENS_REQUIRED, "the images target requires a lens");
        }
        return {
          over,
          hits: await verbs.images({ ownerId, query, topN, lens: params.lens, rerank }),
        };
      }
      case "documents":
        // Owner-only on the WIRE: the omnibox is self-scoped (ownerId = principal.userId), so a databank
        // documents search over `{ownerId}` can never reach another tenant's bank. The chat/character
        // scopes exist on the `documents` VERB but are reached ONLY through the compose-injected op (chat's
        // GATHER, already membership-authorized) — never the un-authorized omnibox, which would let a
        // stranger pass a foreign chatId and pull the host's chunks. requireOwnerScope refuses them here.
        requireOwnerScope(scope, over);
        return {
          over,
          hits: await verbs.documents({ scope: { ownerId }, ownerId, queryText: query, k: topN, minScore: 0, rerank }),
        };
      case "digests":
        return { over, hits: await digestScan(ctx, params, coverage) };
      default:
        return assertNever(over);
    }
  };
  return async (params): Promise<UnifiedSearchResult> => {
    const result = await run(params);
    const candidateLimit = searchCandidateLimit(params);
    return {
      ...result,
      coverage: {
        requestLimit: params.topN,
        candidateLimit,
        evidencePerCharacter: params.over === "discover" ? DISCOVER_SEGMENTS_PER_CHAR : null,
        reranked: params.rerank === true,
      },
    };
  };
}

function searchCandidateLimit(params: UnifiedSearchParams): number {
  switch (params.over) {
    case "discover":
      return Math.min(params.topN * DISCOVER_SEGMENT_POOL_FACTOR, DISCOVER_SEGMENT_POOL_CAP);
    case "corpus":
      return SCOPED_POOL_K;
    case "digests":
    case "documents":
      return Math.min(params.topN * OWNER_OVERFETCH, SCOPED_POOL_K);
    case "entities":
    case "characters":
    case "images":
      return params.topN * OWNER_OVERFETCH;
    default:
      return assertNever(params.over);
  }
}
