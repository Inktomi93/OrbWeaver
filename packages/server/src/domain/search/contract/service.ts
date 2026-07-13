// domain/search/contract/service — typed API surface: SearchContext (DI bundle), SearchServiceDeps
// (entry-root input, identical to the context), SearchService (the verb interface).
//
// search is the one vector-retrieval engine. Its only cross-tier seam is `roleClients` (embed/rerank/
// embedModel), a required dep the entry root wires at boot. search reads the vector tables directly via
// @orb/db (allowed by design — it's the bulk reader) and never calls embeddings verbs.
//
// FLAG[PD-38]: unified search(UnifiedSearchParams) dispatch deferred until the full verb set exists.

import type { RoleClients } from "@orb/contracts/role-clients";
import type { ReadOnlyDb } from "@orb/db";
import type {
  CorpusParams,
  DigestsParams,
  DiscoverParams,
  FieldSearchParams,
  FindCharactersParams,
  ImagesParams,
  KnnParams,
  SegmentsParams,
  SimilarArtParams,
  SimilarCharactersParams,
  SuggestParams,
} from "./params";
import type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
} from "./results";

/** DI bundle the search verbs close over. Read-only (ReadOnlyDb — a write call is a tsc error). */
export interface SearchContext {
  readonly db: ReadOnlyDb;
  readonly roleClients: RoleClients;
  /** Consumed only by the lexical fields/suggest engine's per-owner BM25 index cache (TTL freshness). */
  readonly now: () => number;
}

export type SearchServiceDeps = SearchContext;

export interface SearchService {
  readonly knn: (params: KnnParams) => Promise<SearchHit[]>;
  readonly findCharacters: (params: FindCharactersParams) => Promise<CharacterCardHit[]>;
  /** Returns ranked hits each carrying its BlockKey — the compose root maps these into ChatContext. */
  readonly digests: (params: DigestsParams) => Promise<DigestSearchHit[]>;
  readonly segments: (params: SegmentsParams) => Promise<SegmentSearchHit[]>;
  readonly corpus: (params: CorpusParams) => Promise<CorpusHit[]>;
  /** Ranks on raw cosine distance — hub_score is deliberately not applied on this cross-modal path. */
  readonly images: (params: ImagesParams) => Promise<ImageSearchHit[]>;
  /** score is a BM25 score (higher = better). */
  readonly fields: (params: FieldSearchParams) => Promise<FieldSearchHit[]>;
  readonly suggest: (params: SuggestParams) => Promise<SearchSuggestion[]>;
  readonly discover: (params: DiscoverParams) => Promise<DiscoverCharacter[]>;
  readonly similarCharacters: (params: SimilarCharactersParams) => Promise<CharacterCardHit[]>;
  readonly similarArt: (params: SimilarArtParams) => Promise<SimilarArtHit[]>;
}
