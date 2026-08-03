// domain/search/verbs/search — the unified search() DISPATCH (PD-38). One omnibox call (query + target +
// scope) fans out to the sibling retrieval verbs and wraps each in the `UnifiedSearchResult` discriminated
// union. It is a dispatcher, NOT a new engine: every branch delegates to an existing verb — except the ONE
// genuinely new capability, the by-character cross-chat digest scan, which needs the `chat_digest_speakers`
// OR-branch scope reader. The `switch (over)` is `assertNever`-exhaustive: a new SearchTarget fails tsc
// until its branch lands. SCOPE_INSTRUCTIONS rides here — the one path that embeds/reranks with a per-scope
// instruction hint.
//
// TRUST BOUNDARY (audit #1): the omnibox exposes retrieval to ANY authenticated principal with ANY id, so
// EVERY scope is owner-belted here — memory's `digests`/`segments` verbs deliberately DON'T owner-belt (they
// trust recall's upstream membership check), so this dispatch must never delegate an un-belted chat/character
// scan. Digest scans carry the `characters.ownerId` belt (via the scoped-producer join); the verbatim
// `segments` lens has no producer column, so its chat is gated against the owner's materialized chat set.

import type { MemoryRetrievalMode } from "@orb/contracts/search";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SEARCH_LENS_REQUIRED, SEARCH_SCOPE_REQUIRED, SEARCH_SCOPE_UNSUPPORTED, SearchError } from "../contract/errors.ts";
import type { SearchScope, UnifiedSearchParams } from "../contract/params.ts";
import type { DigestSearchHit, SegmentSearchHit, UnifiedSearchResult } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestDigests, ownedChatIds } from "../persistence/digest-rows.ts";
import { OWNER_OVERFETCH, SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust } from "../substrate/csls.ts";
import { blockKeyStr } from "../substrate/dedupe.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { applyRerank } from "../substrate/rerank.ts";

/** The sibling verbs the dispatch delegates to for the owner-wide card/corpus/image surfaces + the
 *  (owner-gated) within-chat verbatim `segments`. Digests are NOT delegated — every digest scope routes
 *  through the owner-belted `crossChatDigests` here. */
type DelegateVerbs = Pick<SearchService, "knn" | "findCharacters" | "discover" | "corpus" | "images" | "segments" | "documents">;

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

interface DigestScanArgs {
  readonly ownerId: UserId;
  readonly chatId?: ChatId | undefined;
  readonly scopedCharacterId?: CharacterId | undefined;
  readonly speakerCharacterId?: CharacterId | undefined;
  readonly query: string;
  readonly topN: number;
  readonly rerank: boolean;
}

/** The owner-belted digest scan behind every digest scope. `ownerId` is ALWAYS applied (the
 *  characters-join belt — a foreign chat/character yields nothing). `chatId` narrows to one chat;
 *  `speakerCharacterId` is the by-character cross-chat OR-branch (scoped-producer OR present-as-speaker);
 *  `scopedCharacterId` narrows to one egocentric POV. Consumes SCOPE_INSTRUCTIONS for embed + rerank. */
async function digestScan(ctx: SearchContext, args: DigestScanArgs): Promise<DigestSearchHit[]> {
  const embedded = await ctx.roleClients.embed(args.query, {
    inputType: "query",
    instruction: SCOPE_INSTRUCTIONS.digests.query,
  });
  const queryVector = embedded.vectors[0];
  if (queryVector === null || queryVector === undefined) {
    throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
  }
  const pool = await nearestDigests(ctx.db, {
    queryVector,
    model: ctx.roleClients.embedModel,
    ownerId: args.ownerId,
    ...(args.chatId !== undefined ? { chatIds: [args.chatId] } : {}),
    ...(args.scopedCharacterId !== undefined ? { scopedCharacterId: args.scopedCharacterId } : {}),
    ...(args.speakerCharacterId !== undefined ? { speakerCharacterId: args.speakerCharacterId } : {}),
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
  const ordered = args.rerank
    ? await applyRerank(`${SCOPE_INSTRUCTIONS.digests.rerank}\n${args.query}`, ranked, ctx.roleClients.rerank, ranked.length)
    : ranked;
  return ordered.slice(0, args.topN).map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
}

/** digests honors all three scopes, ALL owner-belted: `chat` → one chat; `character` → the cross-chat
 *  OR-branch; `owner` → every owner digest. */
async function dispatchDigests(ctx: SearchContext, params: UnifiedSearchParams): Promise<DigestSearchHit[]> {
  const { scope, ownerId, query, topN, rerank } = params;
  const base = { ownerId, query, topN, rerank: rerank === true };
  switch (scope.kind) {
    case "chat":
      return await digestScan(ctx, {
        ...base,
        chatId: scope.chatId,
        scopedCharacterId: scope.scopedCharacterId,
      });
    case "character":
      return await digestScan(ctx, { ...base, speakerCharacterId: scope.characterId });
    case "owner":
      return await digestScan(ctx, base);
    default:
      return assertNever(scope);
  }
}

/** segments is within-chat verbatim — it needs a chat scope carrying the egocentric POV. The verbatim lens
 *  has no producer column, so the chat is owner-gated against the owner's materialized chat set (the digest
 *  scan's characters-join belt is unavailable here) before the delegated scan runs. */
async function dispatchSegments(ctx: SearchContext, verbs: DelegateVerbs, params: UnifiedSearchParams): Promise<SegmentSearchHit[]> {
  const { scope, ownerId, query, rerank } = params;
  if (scope.kind !== "chat") {
    throw new SearchError(SEARCH_SCOPE_UNSUPPORTED, "the segments target is within-chat verbatim — it needs a chat scope");
  }
  if (scope.scopedCharacterId === undefined) {
    throw new SearchError(SEARCH_SCOPE_REQUIRED, "segments needs an egocentric scopedCharacterId on the chat scope");
  }
  // Owner belt: a chat the principal produced no digests in is not theirs to search (a foreign chatId → []).
  const owned = await ownedChatIds(ctx.db, ownerId, ctx.roleClients.embedModel);
  if (!owned.includes(scope.chatId)) {
    return [];
  }
  return await verbs.segments({
    scope: { chat: scope.chatId },
    scopedCharacterId: scope.scopedCharacterId,
    queryText: query,
    mode: memoryMode(rerank),
    verbatimWindow: 0,
    keywordMatch: false,
    recencyBias: 0,
    minScore: 0,
  });
}

export function createSearch(ctx: SearchContext, verbs: DelegateVerbs): SearchService["search"] {
  return async (params: UnifiedSearchParams): Promise<UnifiedSearchResult> => {
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
        return { over, hits: await verbs.discover({ ownerId, queryText: query, topN, rerank }) };
      case "corpus":
        requireOwnerScope(scope, over);
        return {
          over,
          hits: await verbs.corpus({
            ownerId,
            queryText: query,
            mode: memoryMode(rerank),
            minScore: 0,
          }),
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
          hits: await verbs.documents({ scope: { ownerId }, queryText: query, k: topN, minScore: 0, rerank }),
        };
      case "segments":
        return { over, hits: await dispatchSegments(ctx, verbs, params) };
      case "digests":
        return { over, hits: await dispatchDigests(ctx, params) };
      default:
        return assertNever(over);
    }
  };
}
