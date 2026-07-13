// domain/search/contract/params — every verb's *Params: the card-space surface (knn/findCharacters) plus
// the chat-memory surface (digests/segments/corpus). Card verbs are owner-scoped via characters.ownerId
// (D20 — the vector substrate carries no ownerId; scope derives from the producer).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, UserId } from "@orb/kit/ids";

export interface KnnParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

export interface FindCharactersParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

// FLAG[PD-35]: DigestsParams/SegmentsParams are pure aliases kept only so SearchService signatures self-document.
export type DigestsParams = MemoryQueryOptions;

/** Requires scopedCharacterId (the verbatim lens has no character column) — else SearchError(SCOPE_REQUIRED). */
export type SegmentsParams = MemoryQueryOptions;

export interface CorpusParams {
  readonly ownerId: UserId;
  readonly queryText: string;
  readonly mode: MemoryQueryOptions["mode"];
  readonly minScore: number;
}

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

/** Seed-vector top-k over the card space, seeded from the stored embedding (not a re-embed). */
export interface SimilarCharactersParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly topN: number;
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
