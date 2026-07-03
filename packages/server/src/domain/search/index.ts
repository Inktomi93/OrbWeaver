// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. W2 CORE: the within-space vector retrieval engine (`knn`) + the discovery-consumed
// character-card primitive (`findCharacters`) + their typed surface. The memory/discover/image/lexical
// verbs + the unified `search()`/`SearchScope` dispatch join as they land (see `contract/service.ts`).

export { SEARCH_EMPTY_QUERY, SearchError } from "./contract/errors";

export type {
  CorpusParams,
  DigestsParams,
  FindCharactersParams,
  KnnParams,
  SegmentsParams,
} from "./contract/params";

export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  SearchHit,
  SegmentSearchHit,
} from "./contract/results";

export type { SearchContext, SearchService, SearchServiceDeps } from "./contract/service";

export { createSearchService } from "./service";
