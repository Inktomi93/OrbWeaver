// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface (search.md
// §"Public surface"). W2 CORE: the within-space vector retrieval engine (`knn`) + the discovery-consumed
// character-card primitive (`findCharacters`) + their typed surface. The memory/discover/image/lexical
// verbs + the unified `search()`/`SearchScope` dispatch join as they land (see `contract/service.ts`).

// Errors
export { SEARCH_EMPTY_QUERY, SearchError } from "./contract/errors";

// Input types
export type {
  CorpusParams,
  DigestsParams,
  FindCharactersParams,
  KnnParams,
  SegmentsParams,
} from "./contract/params";

// Result types
export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  SearchHit,
  SegmentSearchHit,
} from "./contract/results";

// Service types
export type { SearchContext, SearchService, SearchServiceDeps } from "./contract/service";

// Factory
export { createSearchService } from "./service";
