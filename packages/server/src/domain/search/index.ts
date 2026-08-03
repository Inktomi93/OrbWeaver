// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. The within-space
// vector retrieval engine (`knn`/`findCharacters`), the chat-memory lenses (`digests`/`segments`/`corpus`),
// the cross-modal `images` + lexical `fields`/`suggest`, the PD-35 discovery lens (`discover`) + its
// seed-vector siblings (`similarCharacters`/`similarArt`), and the unified `search()` dispatch (PD-38) over
// the `SearchScope`/`SearchTarget` axes.

export type { SearchContext } from "./context.ts";
export { SEARCH_EMPTY_QUERY, SearchError } from "./contract/errors.ts";
export {
  type CorpusParams,
  type DigestsParams,
  type DiscoverParams,
  type DocumentSearchParams,
  type FieldSearchParams,
  type FindCharactersParams,
  type ImagesParams,
  type KnnParams,
  SEARCH_TARGETS,
  type SearchScope,
  type SearchTarget,
  type SegmentsParams,
  type SimilarArtParams,
  type SimilarCharactersParams,
  type SuggestParams,
  type UnifiedSearchParams,
} from "./contract/params.ts";
export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  DiscoverSegment,
  DocumentChunkHit,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
  UnifiedSearchResult,
} from "./contract/results.ts";
export type { ResolveActiveDocumentIdsOp, SearchService } from "./contract/service.ts";

export { createSearchService } from "./service.ts";
