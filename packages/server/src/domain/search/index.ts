// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. The within-space
// vector retrieval engine (`knn`/`findCharacters`), the chat-memory lenses (`digests`/`segments`/`corpus`),
// the cross-modal `images` + lexical `fields`/`suggest`, and the PD-35 discovery lens (`discover`) + its
// seed-vector siblings (`similarCharacters`/`similarArt`) + their typed surface. Only the unified
// `search()`/`SearchScope` dispatch (PD-38) remains deferred (see `contract/service.ts`).

export { SEARCH_EMPTY_QUERY, SearchError } from "./contract/errors";

export type {
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
} from "./contract/params";

export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  DiscoverSegment,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
} from "./contract/results";

export type { SearchContext, SearchService, SearchServiceDeps } from "./contract/service";

export { createSearchService } from "./service";
