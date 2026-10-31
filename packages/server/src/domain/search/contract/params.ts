import type { ImageLens } from "@orb/contracts/embeddings";
import type { MemoryQueryOptions, SearchScope, SearchTarget } from "@orb/contracts/search";
import type { CharacterId, UserId } from "@orb/kit/ids";

export type { CorpusParams } from "@orb/contracts/search";

// domain/search/contract/params — every verb's *Params: the card-space surface (knn/findCharacters) plus
// the chat-memory surface (digests/segments/corpus). Card verbs are owner-scoped via characters.ownerId
// (D20 — the vector substrate carries no ownerId; scope derives from the producer).

export interface KnnParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

// `findCharacters` hands its whole params to `knn`, so it takes exactly the `knn` shape.
export type FindCharactersParams = KnnParams;

// DigestsParams/SegmentsParams are ALIASES of the contracts shape — the derive, not a re-spell. Both verbs take
// exactly the memory-recall query wire `@orb/contracts/search` owns; the named aliases exist only so a
// SearchService signature says WHICH verb its argument belongs to. A structural-identity lens (`ast respell`)
// reports them by construction — it cannot see that an alias already IS the one home — so the answer is this
// comment, never a rename or a hand-written body.
export type DigestsParams = MemoryQueryOptions;

/** Requires scopedCharacterId (the verbatim lens has no character column) — else SearchError(SCOPE_REQUIRED). */
export type SegmentsParams = MemoryQueryOptions;

/** Ranking is raw cosine distance — hub_score is deliberately not CSLS-applied on this cross-modal path. */
export interface ImagesParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly lens: ImageLens;
  readonly rerank?: boolean | undefined;
}

export interface DiscoverParams {
  readonly ownerId: UserId;
  readonly queryText: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

export interface SimilarArtParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly topN: number;
  readonly lens?: ImageLens | undefined;
}

export interface FieldSearchParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
}

export interface SuggestParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly limit: number;
}

// ── the unified search() dispatch ─────────────────────────────────────

/** The omnibox call: one query text, one target surface, one scope. `lens` is required only when
 *  `over === "images"` (validated at the transport seam + re-checked in the dispatch). */
export interface UnifiedSearchParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly over: SearchTarget;
  readonly scope: SearchScope;
  readonly rerank?: boolean | undefined;
  readonly lens?: ImageLens | undefined;
}
